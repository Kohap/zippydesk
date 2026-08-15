import { describe, expect, it } from "vitest";
import { buildNarration, parseNarration } from "../lib/domain/narration";

describe("narration scheme", () => {
  it("parses a valid narration", () => {
    expect(parseNarration("GFT-A3-7451")).toEqual({ vendorCode: "A3", orderRef: "7451" });
  });

  it("is case-insensitive and trims", () => {
    expect(parseNarration("  gft-a3-7451 ")).toEqual({ vendorCode: "A3", orderRef: "7451" });
  });

  it("rejects malformed narrations", () => {
    expect(parseNarration("GFT-A-7451")).toBeNull();
    expect(parseNarration("A3-7451")).toBeNull();
    expect(parseNarration("GFT-A3-74510")).toBeNull();
    expect(parseNarration("gift transfer thank you")).toBeNull();
  });

  it("builds narrations within bank limits", () => {
    const n = buildNarration("A3", "7451");
    expect(n).toBe("GFT-A3-7451");
    expect(n.length).toBeLessThanOrEqual(20);
  });
});