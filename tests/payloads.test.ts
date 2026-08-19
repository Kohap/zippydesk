import { describe, expect, it } from "vitest";
import { decodeButtonId, encodeButtonId } from "../lib/infra/payloads";

describe("button payloads", () => {
  it("round-trips every action", () => {
    const actions = [
      { a: "vs", v: "A3" },
      { a: "add", v: "A3", s: "PAR-1", q: 1 },
      { a: "done", v: "A3" },
      { a: "ap", o: "7451" },
      { a: "rj", o: "7451" },
      { a: "pv", o: "7451" },
      { a: "dr", o: "7451" },
      { a: "rd", o: "7451" },
    ] as const;
    for (const action of actions) {
      expect(decodeButtonId(encodeButtonId(action))).toEqual(action);
    }
  });

  it("stays under Meta's 256-char id limit", () => {
    for (const a of [
      { a: "add", v: "A3", s: "PAR-1", q: 1 },
      { a: "ap", o: "745100" },
    ] as const) {
      expect(encodeButtonId(a).length).toBeLessThan(256);
    }
  });
});