import type { Repositories } from "@/lib/ports/repositories";
import type { OrderItem } from "@/lib/domain/types";

/**
 * Verdict for a guarded approval attempt. The wallet draw decides between
 * APPROVED and MANUAL_VERIFICATION_REQUIRED once stock is reserved.
 */
export type ApprovalVerdict = "approved" | "failed_out_of_stock" | "manual_verification_required";

/**
 * Pure decision over the two resource checks. Stock is authoritative: running
 * out of stock fails the order outright, while a wallet shortfall parks the
 * order for manual verification (the owner can fund the wallet and retry).
 */
export function decideApproval(stockOk: boolean, creditOk: boolean): ApprovalVerdict {
  if (!stockOk) return "failed_out_of_stock";
  if (!creditOk) return "manual_verification_required";
  return "approved";
}

export interface CommitApprovalInput {
  vendorId: string;
  merchantId: string;
  orderId: string;
  items: OrderItem[];
}

/**
 * Executor for the `approve_resources` guard. Executes the state table's
 * intent: first atomically reserve stock (all-or-nothing), then draw one
 * wallet credit for the approved order. When the wallet is empty the order
 * still fails safely: the reserved stock is compensated back immediately so no
 * orphaned reservation can leak, and the verdict parks the order in
 * MANUAL_VERIFICATION_REQUIRED for the owner to resolve.
 */
export async function commitApproval(repos: Repositories, input: CommitApprovalInput): Promise<ApprovalVerdict> {
  const reserved = await repos.items.atomicDecrement(input.vendorId, input.items);
  const stockOk = reserved === input.items.length;
  if (!stockOk) return "failed_out_of_stock";

  const draw = await repos.wallet.consumeCredit(input.merchantId, input.orderId, "order-approval");
  if (draw.ok) return "approved";

  await repos.items.restoreStock(input.vendorId, input.items);
  return "manual_verification_required";
}