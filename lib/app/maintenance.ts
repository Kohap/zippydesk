import { formatNaira } from "../domain/payments";
import type { Repositories } from "../ports/repositories";
import type { CustomerChannel } from "./customer-channel";
import type { VendorProvider } from "./vendor-provider";

export class MaintenanceService {
  constructor(
    private repos: Repositories,
    private channel: CustomerChannel,
    private vendors: VendorProvider,
  ) {}

  async runDaily(): Promise<void> {
    await this.remindPendingRefunds();
    await this.realertPendingApprovals();
    await this.auditRefunds();
  }

  private async remindPendingRefunds(): Promise<void> {
    const pending = await this.repos.refunds.listByStatus("pending");
    for (const refund of pending) {
      const order = await this.repos.orders.getById(refund.orderId);
      if (!order) continue;
      const vendor = this.vendors.get(order.vendorId);
      const owner = vendor?.escalation.find((e) => e.role === "owner");
      if (!owner) continue;
      await this.channel.sendTemplate(owner.waId, {
        key: "daily_refund_reminder",
        params: { count: String(pending.length) },
      });
    }
  }

  private async realertPendingApprovals(): Promise<void> {
    const pending = await this.repos.orders.listByStatus("PENDING_APPROVAL");
    for (const order of pending) {
      const vendor = this.vendors.get(order.vendorId);
      const owner = vendor?.escalation.find((e) => e.role === "owner");
      if (!owner) continue;
      await this.channel.sendTemplate(owner.waId, {
        key: "approval_escalated",
        params: { order: order.id },
      });
    }
  }

  private async auditRefunds(): Promise<void> {
    const refunded = await this.repos.refunds.listByStatus("refunded");
    for (const vendor of this.vendors.all()) {
      const owner = vendor.escalation.find((e) => e.role === "owner");
      if (!owner) continue;
      const total = refunded.reduce((sum, r) => sum + r.amountKobo, 0);
      await this.channel.sendTemplate(owner.waId, {
        key: "daily_refund_reminder",
        params: { count: `${refunded.length} confirmed, ${formatNaira(total)} total` },
      });
    }
  }
}