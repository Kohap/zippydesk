export interface SchedulerHandlers {
  onApprovalTimer(orderId: string): Promise<void>;
  onPaymentTtl(orderId: string): Promise<void>;
}

export interface Scheduler {
  setHandlers(handlers: SchedulerHandlers): void;
  scheduleApproval(orderId: string, afterMs: number): Promise<void>;
  schedulePaymentTtl(orderId: string, afterMs: number): Promise<void>;
  cancelOrder(orderId: string): Promise<void>;
  close(): Promise<void>;
}