import { Queue, Worker } from "bullmq";
import { Redis as IORedis } from "ioredis";
import type { Scheduler, SchedulerHandlers } from "../ports/scheduler";

const APPROVAL_QUEUE = "gft-approval";
const TTL_QUEUE = "gft-payment-ttl";
const jobId = (orderId: string) => `o-${orderId}`;

function makeRedis(url: string): IORedis {
  return new IORedis(url, { maxRetriesPerRequest: null });
}

/**
 * Durable scheduler backed by Redis + BullMQ. Jobs survive process restarts:
 * a delayed job created by one process is picked up by the next process's
 * worker when it becomes due. Scheduling an order a second time replaces the
 * existing job (jobId === orderId), mirroring the in-memory scheduler's
 * "reschedule replaces" semantics.
 */
export class BullMQScheduler implements Scheduler {
  private handlers: SchedulerHandlers | null = null;
  private handlersReady: Promise<void>;
  private resolveReady!: () => void;
  private approvalQueue: Queue;
  private ttlQueue: Queue;
  private approvalWorker: Worker;
  private ttlWorker: Worker;
  private connections: IORedis[];
  private closed = false;

  constructor(redisUrl: string) {
    this.handlersReady = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
    const approvalConn = makeRedis(redisUrl);
    const ttlConn = makeRedis(redisUrl);
    const approvalWorkerConn = makeRedis(redisUrl);
    const ttlWorkerConn = makeRedis(redisUrl);
    this.connections = [approvalConn, ttlConn, approvalWorkerConn, ttlWorkerConn];
    this.approvalQueue = new Queue(APPROVAL_QUEUE, { connection: approvalConn, defaultJobOptions: { removeOnComplete: { age: 86_400 }, removeOnFail: { age: 86_400 } } });
    this.ttlQueue = new Queue(TTL_QUEUE, { connection: ttlConn, defaultJobOptions: { removeOnComplete: { age: 86_400 }, removeOnFail: { age: 86_400 } } });
    this.approvalWorker = new Worker(APPROVAL_QUEUE, (job) => this.dispatch(job.name, "approval"), { connection: approvalWorkerConn });
    this.ttlWorker = new Worker(TTL_QUEUE, (job) => this.dispatch(job.name, "payment_ttl"), { connection: ttlWorkerConn });
  }

  setHandlers(handlers: SchedulerHandlers): void {
    this.handlers = handlers;
    this.resolveReady();
  }

  async scheduleApproval(orderId: string, afterMs: number): Promise<void> {
    const id = jobId(orderId);
    await this.approvalQueue.remove(id);
    await this.approvalQueue.add(orderId, { orderId }, { jobId: id, delay: afterMs });
  }

  async schedulePaymentTtl(orderId: string, afterMs: number): Promise<void> {
    const id = jobId(orderId);
    await this.ttlQueue.remove(id);
    await this.ttlQueue.add(orderId, { orderId }, { jobId: id, delay: afterMs });
  }

  async cancelOrder(orderId: string): Promise<void> {
    await Promise.all([this.approvalQueue.remove(jobId(orderId)), this.ttlQueue.remove(jobId(orderId))]);
  }

  private async dispatch(orderId: string, kind: "approval" | "payment_ttl"): Promise<void> {
    await this.handlersReady;
    const handlers = this.handlers;
    if (!handlers) return;
    if (kind === "approval") await handlers.onApprovalTimer(orderId);
    else await handlers.onPaymentTtl(orderId);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await Promise.all([this.approvalWorker.close(), this.ttlWorker.close()]);
    await Promise.all([this.approvalQueue.close(), this.ttlQueue.close()]);
    await Promise.all(this.connections.map((c) => c.quit()));
  }
}
