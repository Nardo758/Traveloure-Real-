interface UserAiRecord {
  userId: string;
  email?: string;
  minuteCount: number;
  minuteResetAt: number;
  hourCount: number;
  hourResetAt: number;
  totalCount: number;
  lastEndpoint: string;
  lastRequestAt: number;
}

class AiUsageTracker {
  private records: Map<string, UserAiRecord> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  private cleanup(): void {
    const cutoff = Date.now() - 2 * 60 * 60 * 1000;
    for (const [key, record] of this.records.entries()) {
      if (record.lastRequestAt < cutoff) {
        this.records.delete(key);
      }
    }
  }

  track(userId: string, endpoint: string, email?: string): void {
    const now = Date.now();
    const existing = this.records.get(userId);

    if (!existing) {
      this.records.set(userId, {
        userId,
        email,
        minuteCount: 1,
        minuteResetAt: now + 60_000,
        hourCount: 1,
        hourResetAt: now + 3_600_000,
        totalCount: 1,
        lastEndpoint: endpoint,
        lastRequestAt: now,
      });
      return;
    }

    if (now > existing.minuteResetAt) {
      existing.minuteCount = 1;
      existing.minuteResetAt = now + 60_000;
    } else {
      existing.minuteCount += 1;
    }

    if (now > existing.hourResetAt) {
      existing.hourCount = 1;
      existing.hourResetAt = now + 3_600_000;
    } else {
      existing.hourCount += 1;
    }

    existing.totalCount += 1;
    existing.lastEndpoint = endpoint;
    existing.lastRequestAt = now;
    if (email) existing.email = email;
  }

  getAll(): UserAiRecord[] {
    return Array.from(this.records.values()).sort((a, b) => b.hourCount - a.hourCount);
  }

  getStats(): {
    totalUsersActive: number;
    platformCallsLastHour: number;
    platformCallsLastMinute: number;
    topUsers: UserAiRecord[];
    usersNearLimit: UserAiRecord[];
  } {
    const all = this.getAll();
    const minuteLimit = 20;
    const hourLimit = 200;

    return {
      totalUsersActive: all.length,
      platformCallsLastHour: all.reduce((s, r) => s + r.hourCount, 0),
      platformCallsLastMinute: all.reduce((s, r) => s + r.minuteCount, 0),
      topUsers: all.slice(0, 20),
      usersNearLimit: all.filter(
        (r) => r.minuteCount >= minuteLimit * 0.8 || r.hourCount >= hourLimit * 0.8
      ),
    };
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.records.clear();
  }
}

export const aiUsageTracker = new AiUsageTracker();
