import { buildContext } from "../lib/context";
import { handleHttp } from "../lib/light-server";

const ctx = buildContext(process.env);

const challenge = await handleHttp(ctx, {
  method: "GET",
  url: "/webhook?hub.mode=subscribe&hub.verify_token=dev-verify-token&hub.challenge=challenge123",
  payload: undefined,
});
console.log("challenge:", challenge.body);

const post = await handleHttp(ctx, { method: "POST", url: "/webhook", payload: { entry: [] } });
console.log("post status:", post.statusCode);

const health = await handleHttp(ctx, { method: "GET", url: "/api/health" });
console.log("health:", JSON.stringify((health.json() as { meta: unknown }).meta));
await ctx.scheduler.close();