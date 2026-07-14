import { beforeEach, describe, expect, it } from "vitest";
import { MAX_RATE_LIMIT_KEYS, RATE_WINDOW_MS, REQ_PER_MIN } from "@/lib/constants";
import { checkRateLimit, rateLimitKey, resetRateLimits } from "./ratelimit";

describe("rate limiter", () => {
  beforeEach(resetRateLimits);
  it("allows requests through the per-minute cap", () => {
    expect(Array.from({ length: REQ_PER_MIN }, () => checkRateLimit("ip", 0)).every(({ allowed }) => allowed)).toBe(true);
  });
  it("rejects one request over the cap", () => {
    Array.from({ length: REQ_PER_MIN }, () => checkRateLimit("ip", 0));
    expect(checkRateLimit("ip", 0).allowed).toBe(false);
  });
  it("includes retry-after seconds", () => {
    Array.from({ length: REQ_PER_MIN }, () => checkRateLimit("ip", 0));
    expect(checkRateLimit("ip", 30_000).retryAfter).toBe(30);
  });
  it("resets after the window", () => {
    Array.from({ length: REQ_PER_MIN }, () => checkRateLimit("ip", 0));
    expect(checkRateLimit("ip", RATE_WINDOW_MS).allowed).toBe(true);
  });
  it("prefers Vercel's trusted forwarding header", () => {
    const request = new Request("http://localhost", {
      headers: {
        "x-vercel-forwarded-for": "203.0.113.9",
        "x-forwarded-for": "attacker, 10.0.0.4",
      },
    });
    expect(rateLimitKey(request)).toBe("203.0.113.9");
  });
  it("uses the last x-forwarded-for entry and falls back to unknown", () => {
    expect(rateLimitKey(new Request("http://localhost", {
      headers: { "x-forwarded-for": "attacker, 10.0.0.4" },
    }))).toBe("10.0.0.4");
    expect(rateLimitKey(new Request("http://localhost"))).toBe("unknown");
  });
  it("keeps recently used buckets during capacity eviction", () => {
    checkRateLimit("legitimate", 0);
    for (let index = 0; index < MAX_RATE_LIMIT_KEYS - 1; index += 1) {
      checkRateLimit(`spoof-${index}`, 0);
    }
    checkRateLimit("legitimate", 0);
    checkRateLimit("new-spoof", 0);
    for (let index = 0; index < REQ_PER_MIN - 2; index += 1) {
      expect(checkRateLimit("legitimate", 0).allowed).toBe(true);
    }
    expect(checkRateLimit("legitimate", 0).allowed).toBe(false);
  });
});
