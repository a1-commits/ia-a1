export const POLL_BASE_MS = 3000;
export const POLL_BACKOFF_MS = [3000, 5000, 10000, 15000] as const;
export const POLL_ERROR_THRESHOLD = 3;
export const API_POLL_TIMEOUT_MS = 30_000;

export class PollFailureTracker {
  private consecutiveFailures = 0;

  recordSuccess(): void {
    this.consecutiveFailures = 0;
  }

  recordFailure(): number {
    this.consecutiveFailures += 1;
    return this.consecutiveFailures;
  }

  get consecutive(): number {
    return this.consecutiveFailures;
  }

  shouldShowError(): boolean {
    return this.consecutiveFailures >= POLL_ERROR_THRESHOLD;
  }

  nextDelayMs(): number {
    if (this.consecutiveFailures <= 0) return POLL_BASE_MS;
    const idx = Math.min(this.consecutiveFailures - 1, POLL_BACKOFF_MS.length - 1);
    return POLL_BACKOFF_MS[idx]!;
  }
}

export function isTransientPollError(status: number | undefined): boolean {
  if (!status) return true;
  return status === 408 || status === 429 || status >= 500;
}
