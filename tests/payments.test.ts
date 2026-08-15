import { describe, expect, it } from "vitest";
import { decidePayment, formatNaira } from "../lib/domain/payments";

describe("payment math", () => {
  it("exact amount settles the balance", () => {
    expect(decidePayment(150000, 150000)).toBe("applied");
  });

  it("less than balance is partial", () => {
    expect(decidePayment(150000, 90000)).toBe("partial");
  });

  it("more than balance is overpayment and never applied", () => {
    expect(decidePayment(150000, 160000)).toBe("overpayment");
  });

  it("rejects invalid amounts", () => {
    expect(() => decidePayment(150000, 0)).toThrow();
    expect(() => decidePayment(150000, -5)).toThrow();
    expect(() => decidePayment(0, 100)).toThrow();
  });

  it("formats kobo as naira", () => {
    expect(formatNaira(150000)).toBe("N1,500");
  });
});