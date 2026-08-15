export const WINDOW_TTL_MS = 24 * 3_600_000;

export interface WindowStore {
  markInbound(waId: string, at: Date): Promise<void>;
  insideWindow(waId: string, at: Date): Promise<boolean>;
}

export class InMemoryWindowStore implements WindowStore {
  private lastInbound = new Map<string, number>();
  private openAll: boolean;

  constructor(openAll = false) {
    this.openAll = openAll;
  }

  async markInbound(waId: string, at: Date): Promise<void> {
    this.lastInbound.set(waId, at.getTime());
  }

  async insideWindow(waId: string, at: Date): Promise<boolean> {
    if (this.openAll) return true;
    const last = this.lastInbound.get(waId);
    if (last === undefined) return false;
    return at.getTime() - last < WINDOW_TTL_MS;
  }
}