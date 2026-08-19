import { buildNarration, parseNarration } from "../domain/narration";
import { decidePayment, formatNaira } from "../domain/payments";
import { statusRequiresPayment } from "../domain/config";
import type { Order, OrderItem, PaymentRecord } from "../domain/types";
import type { ActorKind, OrderStatus } from "../domain/status";
import type { Repositories } from "../ports/repositories";
import type { VisionReceipt } from "../ports/vision";
import type { OutboundImage } from "../ports/messenger";
import type { Scheduler } from "../ports/scheduler";
import type { VendorProvider } from "./vendor-provider";
import type { CustomerChannel } from "./customer-channel";
import { decodeButtonId, encodeButtonId } from "../infra/payloads";
import { assertStateConsistency } from "../domain/state";

let orderSeq = 1000;
const nextOrderId = () => String(++orderSeq);

export class OrderService {
  constructor(
    private repos: Repositories,
    private channel: CustomerChannel,
    private vision: VisionReceiptProvider,
    private vendors: VendorProvider,
    private scheduler: Scheduler,
  ) {
    assertStateConsistency();
    this.scheduler.setHandlers({
      onApprovalTimer: (orderId) => this.timerFire(orderId),
      onPaymentTtl: (orderId) => this.paymentTtlExpiry(orderId),
    });
  }

  async startIntake(customerWaId: string): Promise<void> {
    const active = await this.firstActiveOrder(customerWaId);
    if (active && statusRequiresPayment(active.status)) {
      const vendor = this.vendors.get(active.vendorId);
      await this.channel.sendText(customerWaId, `You have an order (${active.id}) waiting. Send your transfer receipt or the narration GFT-${active.vendorId}-${active.id}.`, {
        key: "payment_instructions",
        params: {
          vendor: vendor?.name ?? active.vendorId,
          amount: formatNaira(active.balanceDueKobo),
          order: active.id,
          account: vendor?.bankAccount ?? "",
          narration: buildNarration(active.vendorId, active.id),
        },
      });
      return;
    }
    const rows = this.vendors.all().map((v) => ({
      id: encodeButtonId({ a: "vs", v: v.id }),
      title: v.name,
    }));
    await this.channel.sendButtons(customerWaId, "Welcome! Choose a vendor:", rows);
  }

  async selectVendor(customerWaId: string, vendorId: string): Promise<void> {
    const vendor = this.vendors.get(vendorId);
    if (!vendor) {
      await this.channel.sendText(customerWaId, "Vendor not found.");
      return;
    }
    const existing = await this.repos.orders.getActiveByCustomerAndVendor(customerWaId, vendorId);
    if (existing) {
      await this.channel.sendText(customerWaId, `You already have order ${existing.id} with ${vendor.name}.`);
      return;
    }
    const order = await this.repos.orders.create({ id: nextOrderId(), customerWaId, vendorId });
    await this.appendEvent(order.id, "customer", "order_created");
    await this.sendCatalog(customerWaId, order);
  }

  async addItem(customerWaId: string, vendorId: string, sku: string, qty: number): Promise<void> {
    const vendor = this.vendors.get(vendorId);
    const order = await this.activePaymentOrder(customerWaId, vendorId);
    if (!vendor || !order) {
      await this.channel.sendText(customerWaId, "Start a new order first.");
      return;
    }
    if (order.cartLocked) {
      await this.channel.sendText(customerWaId, "Your cart is locked for payment. Use /restart to order again.");
      return;
    }
    const item = vendor.items.find((i) => i.sku === sku && i.active);
    if (!item) {
      await this.channel.sendText(customerWaId, "Item not found.");
      return;
    }
    const existing = order.items.find((i) => i.sku === sku);
    const items: OrderItem[] = existing
      ? order.items.map((i) => (i.sku === sku ? { ...i, qty: i.qty + qty } : i))
      : [...order.items, { sku: item.sku, name: item.name, qty, unitKobo: item.priceKobo }];
    const totalKobo = items.reduce((sum, i) => sum + i.unitKobo * i.qty, 0);
    await this.repos.orders.guardTransition(order.id, order.status, {
      items,
      totalKobo,
      balanceDueKobo: totalKobo - order.amountPaidKobo,
    });
    await this.sendCart(customerWaId, order, vendor);
  }

  async finalizeCart(customerWaId: string, vendorId: string): Promise<void> {
    const vendor = this.vendors.get(vendorId);
    const order = await this.activePaymentOrder(customerWaId, vendorId);
    if (!vendor || !order || order.cartLocked || order.items.length === 0) return;
    const locked = await this.repos.orders.guardTransition(order.id, order.status, { cartLocked: true });
    if (!locked) return;
    const narration = buildNarration(vendor.id, order.id);
    await this.channel.sendText(
      customerWaId,
      `Order ${order.id} ready. Total: ${formatNaira(order.totalKobo)}.\nTransfer to ${vendor.bankAccount} with narration ${narration}, then send the receipt screenshot here.`,
      {
        key: "payment_instructions",
        params: {
          vendor: vendor.name,
          amount: formatNaira(order.totalKobo),
          order: order.id,
          account: vendor.bankAccount,
          narration,
        },
      },
    );
    await this.scheduler.schedulePaymentTtl(order.id, vendor.timers.paymentTtlHours * 3_600_000);
  }

  async applyPayment(customerWaId: string, receiptMsgId: string, receipt: VisionReceipt, validationMs?: number): Promise<void> {
    if (!receipt.isSuccessful || receipt.amountKobo == null) {
      await this.channel.sendText(customerWaId, "We couldn't confirm that receipt. Please retake the photo clearly showing the narration.");
      return;
    }
    if (await this.repos.payments.findByReceiptMsgId(receiptMsgId)) {
      await this.channel.sendText(customerWaId, "That receipt was already applied.");
      return;
    }
    const parsed = receipt.narration ? parseNarration(receipt.narration) : null;
    if (!parsed) {
      await this.channel.sendText(customerWaId, "Narration not detected. Transfer with the exact narration shown in your payment instructions.");
      return;
    }
    const order = await this.repos.orders.getById(parsed.orderRef);
    if (!order || order.customerWaId !== customerWaId || order.vendorId !== parsed.vendorCode) {
      await this.channel.sendText(customerWaId, "We couldn't match that receipt to an order for you.");
      return;
    }
    if (!statusRequiresPayment(order.status)) {
      await this.channel.sendText(customerWaId, "That order is not awaiting payment.");
      return;
    }
    const verdict = decidePayment(order.balanceDueKobo, receipt.amountKobo);
    if (verdict === "overpayment") {
      await this.repos.payments.save(this.paymentRecord(order.id, receiptMsgId, receipt, verdict, validationMs));
      await this.appendEvent(order.id, "customer", "overpayment_rejected");
      await this.channel.sendText(
        customerWaId,
        `Overpayment of ${formatNaira(receipt.amountKobo)} vs ${formatNaira(order.balanceDueKobo)} due. The extra will not be applied — tell us to adjust or refund it.`,
      );
      return;
    }
    const target: OrderStatus = verdict === "applied" ? "PENDING_APPROVAL" : "PARTIALLY_PAID";
    const nextPaid = order.amountPaidKobo + receipt.amountKobo;
    const nextBalance = order.balanceDueKobo - receipt.amountKobo;
    const ok = await this.repos.orders.guardTransition(order.id, order.status, {
      status: target,
      amountPaidKobo: nextPaid,
      balanceDueKobo: nextBalance,
    });
    if (!ok) {
      await this.channel.sendText(customerWaId, "That receipt was already applied.");
      return;
    }
    await this.repos.payments.save(this.paymentRecord(order.id, receiptMsgId, receipt, verdict, validationMs));
    await this.appendEvent(order.id, "customer", `payment_${verdict}`);
    const vendorForFee = this.vendors.get(order.vendorId);
    const fee = vendorForFee?.visionFeeCredits ?? 1;
    const draw = await this.repos.wallet.consumeCredit(vendorForFee?.merchantId ?? "merchant-parfait", order.id, "vision-payment-verified", fee);
    if (!draw.ok) {
      // Receipt already committed; a race drained the wallet. Log it for the
      // billing review, never roll back a verified payment.
      await this.appendEvent(order.id, "system", "vision_fee_debit_failed");
    }
    const vendorForTemplate = this.vendors.get(order.vendorId);
    await this.channel.sendText(customerWaId, `Payment of ${formatNaira(receipt.amountKobo)} confirmed${verdict === "partial" ? `. Balance: ${formatNaira(nextBalance)}` : ""}.`, {
      key: "payment_received",
      params: {
        amount: formatNaira(receipt.amountKobo),
        vendor: vendorForTemplate?.name ?? order.vendorId,
        order: order.id,
      },
    });
    if (target === "PENDING_APPROVAL") {
      await this.scheduler.cancelOrder(order.id);
      const vendor = this.vendors.get(order.vendorId);
      await this.scheduler.scheduleApproval(order.id, (vendor?.timers.approvalMinutes ?? 5) * 60_000);
      await this.requestApproval(order, "owner");
    }
  }

  async approve(orderRef: string, waId: string): Promise<void> {
    await this.approveOrReject(orderRef, waId, true);
  }

  async reject(orderRef: string, waId: string): Promise<void> {
    await this.approveOrReject(orderRef, waId, false);
  }

  async timerFire(orderRef: string): Promise<void> {
    const order = await this.repos.orders.getById(orderRef);
    if (!order || order.status !== "PENDING_APPROVAL" || order.escalationLevel !== 0) return;
    const ok = await this.repos.orders.guardTransition(order.id, "PENDING_APPROVAL", { escalationLevel: 1 });
    if (!ok) return;
    await this.scheduler.cancelOrder(order.id);
    await this.appendEvent(order.id, "system", "timer_fire_escalate");
    const vendor = this.vendors.get(order.vendorId);
    const assistant = vendor?.escalation.find((e) => e.role === "assistant");
    if (assistant) {
      await this.channel.sendText(assistant.waId, `Order ${order.id} (${vendor?.name}) needs approval — ${formatNaira(order.totalKobo)} paid ${formatNaira(order.amountPaidKobo)}.`, {
        key: "approval_escalated",
        params: { order: order.id },
      });
    }
  }

  async paymentTtlExpiry(orderRef: string): Promise<void> {
    await this.transitionCancel(orderRef, "payment_ttl");
  }

  async cancelOrder(customerWaId: string): Promise<void> {
    for (const vendor of this.vendors.all()) {
      const active = await this.repos.orders.getActiveByCustomerAndVendor(customerWaId, vendor.id);
      if (active) {
        await this.transitionCancel(active.id, "customer_cancel");
        const vendor = this.vendors.get(active.vendorId);
        await this.channel.sendText(customerWaId, `Order ${active.id} cancelled.`, {
          key: "order_cancelled",
          params: { order: active.id, reason: "cancelled by you" },
        });
        return;
      }
    }
    await this.channel.sendText(customerWaId, "No active order to cancel.");
  }

  async refundDone(orderRef: string, waId: string): Promise<void> {
    const order = await this.repos.orders.getById(orderRef);
    if (!order || order.status !== "PENDING_REFUND") return;
    const vendor = this.vendors.get(order.vendorId);
    if (!vendor?.escalation.some((e) => e.role === "owner" && e.waId === waId)) return;
    const confirmed = await this.repos.refunds.confirmOwner(order.id);
    if (!confirmed) return;
    const ok = await this.repos.orders.guardTransition(order.id, "PENDING_REFUND", { status: "REFUNDED" });
    if (!ok) return;
    await this.appendEvent(order.id, "owner", "refund_confirmed");
  }

  async onCustomerText(customerWaId: string, text: string): Promise<void> {
    const body = text.trim().toLowerCase();
    if (body === "start" || body === "hello") {
      await this.startIntake(customerWaId);
      return;
    }
    if (body === "cancel") {
      await this.cancelOrder(customerWaId);
      return;
    }
    const active = await this.firstActiveOrder(customerWaId);
    if (active && statusRequiresPayment(active.status)) {
      const vendor = this.vendors.get(active.vendorId);
      await this.channel.sendText(
        customerWaId,
        `Order ${active.id} is awaiting payment. Transfer ${formatNaira(active.balanceDueKobo)} with narration GFT-${active.vendorId}-${active.id}, then send the receipt here.`,
        {
          key: "payment_instructions",
          params: {
            vendor: vendor?.name ?? active.vendorId,
            amount: formatNaira(active.balanceDueKobo),
            order: active.id,
            account: vendor?.bankAccount ?? "",
            narration: buildNarration(active.vendorId, active.id),
          },
        },
      );
      return;
    }
    await this.startIntake(customerWaId);
  }

  async handleButton(customerWaId: string, buttonId: string): Promise<void> {
    const action = decodeButtonId(buttonId);
    switch (action.a) {
      case "vs":
        await this.selectVendor(customerWaId, action.v);
        break;
      case "add":
        await this.addItem(customerWaId, action.v, action.s, action.q);
        break;
      case "done":
        await this.finalizeCart(customerWaId, action.v);
        break;
      case "ap":
        await this.approve(action.o, customerWaId);
        break;
      case "pv":
        await this.resolveManualPayment(action.o, customerWaId, true);
        break;
      case "dr":
        await this.resolveManualPayment(action.o, customerWaId, false);
        break;
      case "rj":
        await this.reject(action.o, customerWaId);
        break;
      case "rd":
        await this.refundDone(action.o, customerWaId);
        break;
    }
  }

  /**
   * Owner-only resolution of a manually reviewed receipt (wallet-empty
   * fallback). Dequeues the pending review FIRST so stale presses (the order
   * meanwhile moved on: AI-verified, converged, or TTL-cancelled) still clear
   * the queue instead of leaking phantom pending reviews or nudging an order
   * they no longer apply to.
   */
  async resolveManualPayment(orderRef: string, waId: string, accepted: boolean): Promise<void> {
    const pending = await this.repos.manualReviews.consume(orderRef);
    if (!pending) return;
    const order = await this.repos.orders.getById(orderRef);
    if (!order) return;
    const vendor = this.vendors.get(order.vendorId);
    const owner = vendor?.escalation.find((e) => e.role === "owner" && e.waId === waId);
    if (!owner) return;
    if (!accepted) {
      await this.appendEvent(order.id, "owner", "manual_review_rejected");
      await this.channel.sendText(
        order.customerWaId,
        `We could not verify the receipt you sent for order ${order.id}. Please re-send a clear screenshot of the transfer receipt.`,
      );
      return;
    }
    if (!statusRequiresPayment(order.status)) {
      // The order already moved on (e.g. receipt AI-verified meanwhile);
      // the pending review is cleared, nothing left to apply.
      return;
    }
    const remaining = order.balanceDueKobo;
    if (remaining <= 0) return;
    const ok = await this.repos.orders.guardTransition(order.id, order.status, {
      status: "PENDING_APPROVAL",
      amountPaidKobo: order.amountPaidKobo + remaining,
      balanceDueKobo: 0,
    });
    if (!ok) return;
    await this.repos.payments.save({
      id: `pmt-manual-${order.id}`,
      orderId: order.id,
      amountKobo: remaining,
      narration: "MANUAL-VERIFIED",
      visionJson: null,
      receiptMsgId: pending.mediaMsgId,
      verdict: "manual",
      createdAt: new Date(),
    });
    await this.appendEvent(order.id, "owner", "payment_manual_verified");
    await this.channel.sendText(order.customerWaId, `Payment for order ${order.id} confirmed manually.`, {
      key: "payment_received",
      params: { amount: formatNaira(remaining), vendor: vendor?.name ?? order.vendorId, order: order.id },
    });
    await this.scheduler.cancelOrder(order.id);
    await this.scheduler.scheduleApproval(order.id, (vendor?.timers.approvalMinutes ?? 5) * 60_000);
    await this.requestApproval(order, "owner");
  }

  /**
   * Wallet-empty vision fallback executed by the ingestion layer: skip the AI
   * call, park the receipt for the owner, and forward the raw image.
   * `orderId` is the order the ingestion gate already resolved for the wallet
   * check — never re-locate the order here, or a multi-vendor customer could
   * get a different merchant's order reviewed.
   */
  async receiptManualFallback(orderId: string, customerWaId: string, senderWaId: string, mediaMsgId: string, image: OutboundImage): Promise<void> {
    const order = await this.repos.orders.getById(orderId);
    const vendor = order ? this.vendors.get(order.vendorId) : null;
    await this.repos.manualReviews.save({
      orderId: order?.id ?? `unknown-${mediaMsgId}`,
      vendorId: order?.vendorId ?? "",
      customerWaId,
      senderWaId,
      mediaMsgId,
      notes: "wallet-empty manual review",
      createdAt: new Date(),
    });
    await this.channel.sendText(
      customerWaId,
      order
        ? `Your receipt for order ${order.id} is being reviewed by a staff member — we'll confirm your payment here shortly.`
        : "We're having our team review your receipt manually — we'll confirm shortly.",
    );
    const owner = vendor?.escalation.find((e) => e.role === "owner");
    if (!owner) return;
    await this.channel.sendImage(owner.waId, image);
    await this.channel.sendButtons(
      owner.waId,
      `Manual verification needed on order ${order?.id ?? "unknown"}: the merchant wallet has no credits for OCR, and this receipt could not be machine-read. Review the raw image above.`,
      order
        ? [
            { id: encodeButtonId({ a: "pv", o: order.id }), title: "Payment verified" },
            { id: encodeButtonId({ a: "dr", o: order.id }), title: "Reject receipt" },
          ]
        : [],
    );
  }

  private async approveOrReject(orderRef: string, waId: string, approve: boolean): Promise<void> {
    const order = await this.repos.orders.getById(orderRef);
    if (!order || order.status !== "PENDING_APPROVAL") return;
    const vendor = this.vendors.get(order.vendorId);
    if (!vendor) return;
    const entry = vendor.escalation.find((e) => e.waId === waId);
    if (!entry) return;
    const actor = entry.role as ActorKind;
    if (actor === "assistant" && order.escalationLevel !== 1) return;

    if (!approve) {
      const ok = await this.repos.orders.guardTransition(order.id, "PENDING_APPROVAL", { status: "PENDING_REFUND" });
      if (!ok) return;
      await this.scheduler.cancelOrder(order.id);
      await this.appendEvent(order.id, actor, "rejected");
      await this.startRefund(order, "rejected");
      return;
    }

    const changed = await this.repos.items.atomicDecrement(order.vendorId, order.items);
    if (changed === order.items.length) {
      const ok = await this.repos.orders.guardTransition(order.id, "PENDING_APPROVAL", { status: "APPROVED" });
      if (!ok) return;
      await this.scheduler.cancelOrder(order.id);
      await this.appendEvent(order.id, actor, "approved");
      await this.channel.sendText(order.customerWaId, `Order ${order.id} confirmed. We'll be in touch!`, {
        key: "order_confirmed",
        params: {
          vendor: vendor.name,
          order: order.id,
          items: order.items.map((i) => `${i.name} x${i.qty}`).join(", "),
        },
      });
    } else {
      const ok = await this.repos.orders.guardTransition(order.id, "PENDING_APPROVAL", { status: "FAILED_OUT_OF_STOCK" });
      if (!ok) return;
      await this.scheduler.cancelOrder(order.id);
      await this.appendEvent(order.id, actor, "approve_failed_out_of_stock");
      await this.startRefund(order, "out_of_stock");
      // Close the protocol leg: FAILED_OUT_OF_STOCK --REFUND_PROTOCOL_START--> PENDING_REFUND,
      // so the owner's "Refund Completed" press can finish the loop.
      await this.repos.orders.guardTransition(order.id, "FAILED_OUT_OF_STOCK", { status: "PENDING_REFUND" });
    }
  }

  private async startRefund(order: Order, reason: string): Promise<void> {
    await this.repos.refunds.create(order);
    await this.appendEvent(order.id, "system", `refund_protocol_${reason}`);
    await this.channel.sendText(order.customerWaId, `Order ${order.id} could not be fulfilled (${reason}). Your ${formatNaira(order.amountPaidKobo)} will be refunded by the vendor — they've been notified.`, {
      key: "stock_failed_refund",
      params: { order: order.id, amount: formatNaira(order.amountPaidKobo) },
    });
    const vendor = this.vendors.get(order.vendorId);
    const owner = vendor?.escalation.find((e) => e.role === "owner");
    if (owner) {
      await this.channel.sendButtons(owner.waId, `URGENT REFUND REQUIRED — order ${order.id} (${reason}). Refund ${formatNaira(order.amountPaidKobo)} to ${order.customerWaId} then tap below.`, [
        { id: encodeButtonId({ a: "rd", o: order.id }), title: "Refund Completed" },
      ], {
        key: "refund_required_urgent",
        params: { amount: formatNaira(order.amountPaidKobo), order: order.id, customer: order.customerWaId },
      });
    }
  }

  private async transitionCancel(orderId: string, cause: "customer_cancel" | "payment_ttl"): Promise<void> {
    const order = await this.repos.orders.getById(orderId);
    if (!order || !["ORDER_PENDING_PAYMENT", "PARTIALLY_PAID"].includes(order.status)) return;
    const ok = await this.repos.orders.guardTransition(order.id, order.status, { status: "CANCELLED" });
    if (!ok) return;
    await this.scheduler.cancelOrder(order.id);
    await this.appendEvent(order.id, "system", cause);
  }

  private async requestApproval(order: Order, actor: ActorKind): Promise<void> {
    const vendor = this.vendors.get(order.vendorId);
    const target = vendor?.escalation.find((e) => e.role === actor);
    if (!vendor || !target) return;
    await this.channel.sendButtons(target.waId, `Order ${order.id} paid ${formatNaira(order.amountPaidKobo)}. Approve?`, [
      { id: encodeButtonId({ a: "ap", o: order.id }), title: "Approve" },
      { id: encodeButtonId({ a: "rj", o: order.id }), title: "Reject" },
    ], {
      key: "order_requires_approval",
      params: { vendor: vendor.name, order: order.id, amount: formatNaira(order.amountPaidKobo) },
    });
  }

  private async sendCatalog(customerWaId: string, order: Order): Promise<void> {
    const vendor = this.vendors.get(order.vendorId);
    if (!vendor) return;
    for (const item of vendor.items.filter((i) => i.active)) {
      await this.channel.sendButtons(customerWaId, `${item.name} — ${formatNaira(item.priceKobo)}`, [
        { id: encodeButtonId({ a: "add", v: order.vendorId, s: item.sku, q: 1 }), title: "Add 1" },
      ]);
    }
    await this.channel.sendButtons(customerWaId, "Done ordering?", [
      { id: encodeButtonId({ a: "done", v: order.vendorId }), title: "Checkout" },
    ]);
  }

  private async sendCart(customerWaId: string, order: Order, vendor: ReturnType<VendorProvider["get"]> & {}): Promise<void> {
    const lines = order.items.map((i) => `${i.name} x${i.qty} = ${formatNaira(i.unitKobo * i.qty)}`).join("\n");
    await this.channel.sendButtons(customerWaId, `Your cart (${vendor.name}):\n${lines}\nTotal: ${formatNaira(order.totalKobo)}`, [
      { id: encodeButtonId({ a: "done", v: order.vendorId }), title: "Checkout" },
    ]);
  }

  private async activePaymentOrder(customerWaId: string, vendorId: string): Promise<Order | null> {
    const order = await this.repos.orders.getActiveByCustomerAndVendor(customerWaId, vendorId);
    if (!order || !statusRequiresPayment(order.status)) return null;
    return order;
  }

  /** Ingestion-gate locator: the payment-state order whose merchant wallet
   * gates the vision call. */
  async getActivePaymentOrder(customerWaId: string): Promise<Order | null> {
    for (const vendor of this.vendors.all()) {
      const order = await this.activePaymentOrder(customerWaId, vendor.id);
      if (order) return order;
    }
    return null;
  }

  /** Merchant resolution for the vision gate (wallet + fee for a vendor). */
  merchantOf(vendorId: string): { merchantId: string; visionFeeCredits: number } {
    const vendor = this.vendors.get(vendorId);
    return { merchantId: vendor?.merchantId ?? "merchant-parfait", visionFeeCredits: vendor?.visionFeeCredits ?? 1 };
  }

  private async firstActiveOrder(customerWaId: string): Promise<Order | null> {
    for (const vendor of this.vendors.all()) {
      const order = await this.repos.orders.getActiveByCustomerAndVendor(customerWaId, vendor.id);
      if (order) return order;
    }
    return null;
  }

  private paymentRecord(orderId: string, receiptMsgId: string, receipt: VisionReceipt, verdict: "applied" | "partial" | "overpayment", validationMs?: number): PaymentRecord {
    return {
      id: `pmt-${receiptMsgId}`,
      orderId,
      amountKobo: receipt.amountKobo ?? 0,
      narration: receipt.narration ?? "",
      visionJson: receipt,
      receiptMsgId,
      verdict,
      ...(validationMs !== undefined ? { validationMs } : {}),
      createdAt: new Date(),
    };
  }

  private async appendEvent(orderId: string, actor: ActorKind, action: string): Promise<void> {
    await this.repos.events.append({ id: `evt-${orderId}-${action}-${Date.now()}`, orderId, actor, action, at: new Date() });
  }
}

interface VisionReceiptProvider {
  extractReceipt(imageBytes: Buffer): Promise<VisionReceipt>;
}