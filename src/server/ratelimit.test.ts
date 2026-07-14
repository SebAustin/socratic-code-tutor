import { beforeEach, describe, expect, it } from "vitest";
import { RATE_WINDOW_MS, REQ_PER_MIN } from "@/lib/constants";
import { checkRateLimit, resetRateLimits } from "./ratelimit";

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
});
