import { describe, expect, it } from "vitest";
import { WindowedMessenger } from "../lib/app/customer-channel";
import { InMemoryWindowStore, WINDOW_TTL_MS } from "../lib/ports/window";
import { RecordingMessenger } from "../lib/infra/inmemory";

function setup(openAll = false) {
  const messenger = new RecordingMessenger();
  const window = new InMemoryWindowStore(openAll);
  const channel = new WindowedMessenger(messenger, window, () => new Date("2026-08-15T12:00:00Z"));
  return { messenger, window, channel };
}

describe("WindowedMessenger", () => {
  it("sends free-form inside the 24h window", async () => {
    const { messenger, window, channel } = setup();
    await window.markInbound("2348011111111", new Date("2026-08-15T11:00:00Z"));
    await channel.sendText("2348011111111", "hello", { key: "order_confirmed", params: { vendor: "V", order: "1", items: "x" } });
    expect(messenger.sent).toHaveLength(1);
    expect(messenger.sent[0]!.type).toBe("text");
  });

  it("falls back to the template outside the window", async () => {
    const { messenger, channel } = setup();
    await channel.sendText("2348011111111", "free-form", { key: "order_confirmed", params: { vendor: "V", order: "1", items: "x" } });
    expect(messenger.sent).toHaveLength(1);
    expect(messenger.sent[0]!.type).toBe("template");
    expect((messenger.sent[0]!.payload as { templateName: string }).templateName).toBe("order_confirmed");
  });

  it("drops unrouted out-of-window sends", async () => {
    const { messenger, channel } = setup();
    await channel.sendText("2348011111111", "free-form");
    expect(messenger.sent).toHaveLength(0);
  });

  it("buttons become a template without buttons outside the window", async () => {
    const { messenger, channel } = setup();
    await channel.sendButtons("2348011111111", "Approve?", [{ id: "x", title: "Approve" }], {
      key: "order_requires_approval",
      params: { vendor: "V", order: "1", amount: "N100" },
    });
    expect(messenger.sent).toHaveLength(1);
    expect(messenger.sent[0]!.type).toBe("template");
  });

  it("rejects out-of-window after exactly 24h", async () => {
    const { window, channel } = setup();
    const t0 = new Date("2026-08-15T12:00:00Z").getTime() - WINDOW_TTL_MS;
    await window.markInbound("2348011111111", new Date(t0));
    const messenger = new RecordingMessenger();
    const w2 = new WindowedMessenger(messenger, window, () => new Date("2026-08-15T12:00:00Z"));
    await w2.sendText("2348011111111", "x", { key: "order_confirmed", params: { vendor: "V", order: "1", items: "x" } });
    expect(messenger.sent[0]!.type).toBe("template");
  });

  it("markInbound refreshes the rolling window", async () => {
    const { messenger, window, channel } = setup();
    const t0 = new Date("2026-08-15T12:00:00Z").getTime() - WINDOW_TTL_MS + 1;
    await window.markInbound("2348011111111", new Date(t0));
    expect(await window.insideWindow("2348011111111", new Date("2026-08-15T12:00:00Z"))).toBe(true);
    await channel.sendText("2348011111111", "inside", { key: "order_confirmed", params: { vendor: "V", order: "1", items: "x" } });
    expect(messenger.sent[0]!.type).toBe("text");
  });
});