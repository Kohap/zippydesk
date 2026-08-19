import { readFileSync } from "node:fs";
import { loadVendorConfig, type HydratedVendorConfigFile } from "./domain/config";
import {
  InMemoryScheduler,
  makeInMemoryRepositories,
  RecordingMessenger,
  StubVisionExtractor,
} from "./infra/inmemory";
import { MetaMessenger } from "./infra/meta-sender";
import { MetaMediaFetcher } from "./infra/meta-media";
import { GeminiVisionAdapter } from "./infra/gemini-vision";
import { BullMQScheduler } from "./infra/redis-scheduler";
import { WindowedMessenger } from "./app/customer-channel";
import { InMemoryWindowStore } from "./ports/window";
import { OrderService } from "./app/order-service";
import { MaintenanceService } from "./app/maintenance";
import { makePrismaRepositories, bootstrapPrismaBilling } from "./infra/prisma-repos";
import type { Repositories } from "./ports/repositories";
import type { Messenger } from "./ports/messenger";
import type { VisionExtractor } from "./ports/vision";
import type { MediaFetcher } from "./ports/media";
import type { WindowStore } from "./ports/window";
import type { Scheduler } from "./ports/scheduler";
import type { CustomerChannel } from "./app/customer-channel";

export interface AppContext {
  repos: Repositories;
  messenger: Messenger;
  channel: CustomerChannel;
  window: WindowStore;
  vision: VisionExtractor;
  media: MediaFetcher;
  service: OrderService;
  maintenance: MaintenanceService;
  scheduler: Scheduler;
  config: HydratedVendorConfigFile;
  meta: {
    db: "postgres" | "in-memory";
    messenger: "meta" | "recording";
    vision: "gemini" | "stub";
    scheduler: "bullmq" | "in-memory";
  };
}

const DAY_MS = 24 * 3_600_000;

export function buildContext(env: NodeJS.ProcessEnv): AppContext {
  const config = loadVendorConfig(env.VENDOR_CONFIG_PATH ? readFileSync(env.VENDOR_CONFIG_PATH, "utf8") : undefined);
  const repos = env.DATABASE_URL ? makePrismaRepositories(env.DATABASE_URL) : makeInMemoryRepositories(config);
  if (env.DATABASE_URL) {
    // Fresh databases must not silently park every receipt into the
    // wallet-empty manual fallback: seed the configured merchants' wallets.
    void bootstrapPrismaBilling(env.DATABASE_URL, config.vendors).catch((err) => console.error("billing bootstrap failed", err));
  }
  const messenger =
    env.META_ACCESS_TOKEN && env.META_PHONE_NUMBER_ID
      ? new MetaMessenger(env.META_ACCESS_TOKEN, env.META_PHONE_NUMBER_ID)
      : new RecordingMessenger();
  const media = env.META_ACCESS_TOKEN ? new MetaMediaFetcher(env.META_ACCESS_TOKEN) : { fetchImage: async () => Buffer.alloc(0) };
  const vision = env.GEMINI_API_KEY
    ? new GeminiVisionAdapter(env.GEMINI_API_KEY, env.GEMINI_MODEL)
    : env.VISION_RECEIPT_BODY
      ? StubVisionExtractor.receipt(env.VISION_RECEIPT_BODY)
      : new StubVisionExtractor(() => ({ errorReason: "VISION_PROVIDER_NOT_CONFIGURED", isSuccessful: false }));
  const window = new InMemoryWindowStore();
  const channel = new WindowedMessenger(messenger, window);

  const vendors = {
    get(id: string) {
      return config.vendors.find((x) => x.id === id) ?? null;
    },
    all() {
      return config.vendors;
    },
  };
  const scheduler = env.REDIS_URL ? new BullMQScheduler(env.REDIS_URL) : new InMemoryScheduler();
  const service = new OrderService(repos, channel, vision, vendors, scheduler);
  const maintenance = new MaintenanceService(repos, channel, vendors);
  return {
    repos,
    messenger,
    channel,
    window,
    vision,
    media,
    service,
    maintenance,
    scheduler,
    config,
    meta: {
      db: env.DATABASE_URL ? "postgres" : "in-memory",
      messenger: env.META_ACCESS_TOKEN && env.META_PHONE_NUMBER_ID ? "meta" : "recording",
      vision: env.GEMINI_API_KEY ? "gemini" : "stub",
      scheduler: env.REDIS_URL ? "bullmq" : "in-memory",
    },
  };
}

export function startMaintenance(ctx: AppContext): NodeJS.Timeout {
  const timer = setInterval(() => {
    void ctx.maintenance.runDaily().catch((err) => console.error("daily maintenance failed", err));
  }, DAY_MS);
  timer.unref();
  return timer;
}

const GLOBAL_KEY = "__zippydesk_context__";

/**
 * Next.js-safe singleton: the OrderService (and its BullMQ worker) must exist
 * once per process, never per request. Cached on globalThis across HMR.
 */
export function getAppContext(): AppContext {
  const g = globalThis as Record<string, unknown>;
  if (g[GLOBAL_KEY]) return g[GLOBAL_KEY] as AppContext;
  const ctx = buildContext(process.env);
  g[GLOBAL_KEY] = ctx;
  if (!process.env.VITEST) {
    startMaintenance(ctx);
    process.once("SIGTERM", () => {
      void ctx.scheduler.close();
    });
  }
  return ctx;
}
