// Regression snapshot: ISSUE-002 (google QA). topUpWallet returned a stale
// balanceCredits — the postgres path read the wallet through the global prisma
// client INSIDE the interactive $transaction, so it saw pre-commit state. The
// mock below emulates that isolation (global reads only see committed values),
// so this test fails against the old code and passes against the fix.
import { describe, expect, it, vi } from "vitest";
import { topUpWallet } from "../lib/api/wallet";
import type { AppContext } from "../lib/context";

const state = vi.hoisted(() => ({ pending: 100, committed: 100 }));

vi.mock("../lib/infra/prisma", () => ({
  getPrisma: () => ({
    wallet: {
      findUnique: async () => ({
        id: "w1",
        merchantId: "merchant-parfait",
        balanceCredits: state.committed,
        lowThreshold: 100,
        autoRecharge: false,
        autoRechargeAmount: null,
        acceptingOrders: true,
      }),
      update: async ({ data }: { data: { balanceCredits: number } }) => {
        state.pending = data.balanceCredits;
        return { id: "w1" };
      },
    },
    creditTransaction: {
      create: async () => ({}),
      findMany: async () => [],
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        wallet: {
          findUnique: async () => ({
            id: "w1",
            merchantId: "merchant-parfait",
            balanceCredits: state.pending,
            lowThreshold: 100,
            autoRecharge: false,
            autoRechargeAmount: null,
            acceptingOrders: true,
          }),
          update: async ({ data }: { data: { balanceCredits: number } }) => {
            state.pending = data.balanceCredits;
            return { id: "w1" };
          },
        },
        creditTransaction: { create: async () => ({}) },
      };
      const result = await fn(tx);
      state.committed = state.pending;
      return result;
    },
  }),
}));

const ctx = { meta: { db: "postgres" } } as AppContext;

describe("topUpWallet postgres path", () => {
  it("returns the post-mutation balance, not the pre-commit read", async () => {
    const wallet = await topUpWallet(ctx, "merchant-parfait", 100, "card", null);
    expect(wallet).not.toBeNull();
    expect(wallet?.balanceCredits).toBe(200);
  });
});