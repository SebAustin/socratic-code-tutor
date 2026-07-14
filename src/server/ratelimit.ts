import {
  MAX_RATE_LIMIT_KEYS,
  RATE_WINDOW_MS,
  REQ_PER_MIN,
} from "@/lib/constants";

type Bucket = { count: number; startedAt: number };
const buckets = new Map<string, Bucket>();

export function checkRateLimit(
  key: string,
  now = Date.now(),
): { allowed: boolean; retryAfter: number } {
  const existing = buckets.get(key);
  if (!existing || now - existing.startedAt >= RATE_WINDOW_MS) {
    buckets.set(key, { count: 1, startedAt: now });
    return { allowed: true, retryAfter: 0 };
  }
  if (existing.count >= REQ_PER_MIN) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((RATE_WINDOW_MS - (now - existing.startedAt)) / 1_000)),
    };
  }
  existing.count += 1;
  if (buckets.size > MAX_RATE_LIMIT_KEYS) buckets.delete(buckets.keys().next().value ?? "");
  return { allowed: true, retryAfter: 0 };
}

export function resetRateLimits(): void {
  buckets.clear();
}
