import { buildNarration, parseNarration } from "../domain/narration";
import { decidePayment, formatNaira } from "../domain/payments";
import { statusHoldsCustomer, statusRequiresPayment } from "../domain/config";
import type { Order, OrderItem, PaymentRecord } from "../domain/types";
import type { ActorKind, OrderStatus } from "../domain/status";
import type { Repositories } from "../ports/repositories";
import type { VisionReceipt } from "../ports/vision";
import type { Scheduler } from "../ports/scheduler";
import type { VendorProvider } from "./vendor-provider";
import type { CustomerChannel } from "./customer-channel";
import { decodeButtonId, encodeButtonId } from "../infra/payloads";
import { assertStateConsistency } from "../domain/state";
import { commitApproval } from "./order-fsm";

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
    if (active && statusHoldsCustomer(active.status)) {
      if (active.status === "MANUAL_VERIFICATION_REQUIRED") {
        await this.channel.sendText(customerWaId, `Your order (${active.id}) is on a short manual hold while we confirm capacity. We'll update you here shortly. Type cancel to back out.`, {
          key: "order_manual_hold",
          params: { order: active.id },
        });
        return;
      }
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
    if (active && statusHoldsCustomer(active.status)) {
      if (active.status === "MANUAL_VERIFICATION_REQUIRED") {
        await this.channel.sendText(customerWaId, `Your order (${active.id}) is on a short manual hold while we confirm capacity. We'll update you here shortly. Type cancel to back out.`, {
          key: "order_manual_hold",
          params: { order: active.id },
        });
        return;
      }
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
      case "mv":
        await this.approve(action.o, customerWaId);
        break;
      case "rj":
        await this.reject(action.o, customerWaId);
        break;
      case "rd":
        await this.refundDone(action.o, customerWaId);
        break;
    }
  }

  private async approveOrReject(orderRef: string, waId: string, approve: boolean): Promise<void> {
    const order = await this.repos.orders.getById(orderRef);
    if (!order || !["PENDING_APPROVAL", "MANUAL_VERIFICATION_REQUIRED"].includes(order.status)) return;
    const vendor = this.vendors.get(order.vendorId);
    if (!vendor) return;
    const entry = vendor.escalation.find((e) => e.waId === waId);
    if (!entry) return;
    const actor = entry.role as ActorKind;
    if (actor === "assistant" && order.escalationLevel !== 1) return;
    // Manual verification is owner-only; the assistant never re-runs the hot path.
    if (actor === "assistant" && order.status === "MANUAL_VERIFICATION_REQUIRED") return;

    if (!approve) {
      const ok = await this.repos.orders.guardTransition(order.id, order.status, { status: "PENDING_REFUND" });
      if (!ok) return;
      await this.scheduler.cancelOrder(order.id);
      await this.appendEvent(order.id, actor, "rejected");
      await this.startRefund(order, "rejected");
      return;
    }

    const okayBranch = order.status === "MANUAL_VERIFICATION_REQUIRED" && actor === "owner"
      ? "OWNER_MANUAL_RESOLVED"
      : actor === "assistant"
        ? "ASSISTANT_APPROVE"
        : "OWNER_APPROVE";
    const verdict = await commitApproval(this.repos, {
      vendorId: order.vendorId,
      merchantId: vendor.merchantId,
      orderId: order.id,
      items: order.items,
    });
    const expected = order.status;
    switch (verdict) {
      case "approved": {
        const ok = await this.repos.orders.guardTransition(order.id, expected, { status: "APPROVED" });
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
        return;
      }
      case "failed_out_of_stock": {
        const ok = await this.repos.orders.guardTransition(order.id, expected, { status: "FAILED_OUT_OF_STOCK" });
        if (!ok) return;
        await this.scheduler.cancelOrder(order.id);
        await this.appendEvent(order.id, actor, "approve_failed_out_of_stock");
        await this.startRefund(order, "out_of_stock");
        // Close the protocol leg: FAILED_OUT_OF_STOCK --REFUND_PROTOCOL_START--> PENDING_REFUND,
        // so the owner's "Refund Completed" press can finish the loop.
        await this.repos.orders.guardTransition(order.id, "FAILED_OUT_OF_STOCK", { status: "PENDING_REFUND" });
        return;
      }
      case "manual_verification_required": {
        if (order.status === "MANUAL_VERIFICATION_REQUIRED") {
          // Re-attempt while still empty: restock already compensated below,
          // re-notify so the owner knows the retry did not clear.
          await this.requestManualResolution(order, vendor);
          return;
        }
        const ok = await this.repos.orders.guardTransition(order.id, expected, { status: "MANUAL_VERIFICATION_REQUIRED" });
        if (!ok) return;
        await this.scheduler.cancelOrder(order.id);
        await this.appendEvent(order.id, actor, "manual_verification_required");
        await this.requestManualResolution(order, vendor);
        return;
      }
    }
  }

  private async requestManualResolution(order: Order, vendor: ReturnType<VendorProvider["get"]> & {}): Promise<void> {
    await this.channel.sendText(
      order.customerWaId,
      `Order ${order.id} is on a short manual hold while we confirm capacity — we'll update you shortly.`,
      { key: "order_manual_hold", params: { order: order.id } },
    );
    const owner = vendor?.escalation.find((e) => e.role === "owner");
    if (!owner) return;
    await this.channel.sendButtons(
      owner.waId,
      `Order ${order.id} was approved on your side but the ${vendor?.merchantId ?? "merchant"} credit wallet is empty. Top up the wallet, then complete the order — or refund the customer instead.`,
      [
        { id: encodeButtonId({ a: "mv", o: order.id }), title: "Credit added — complete" },
        { id: encodeButtonId({ a: "rj", o: order.id }), title: "Refund instead" },
      ],
      { key: "manual_verification_required", params: { order: order.id, merchant: vendor?.merchantId ?? "" } },
    );
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
    if (!order || !["ORDER_PENDING_PAYMENT", "PARTIALLY_PAID", "MANUAL_VERIFICATION_REQUIRED"].includes(order.status)) return;
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