import { beforeEach, describe, expect, it, vi } from "vitest";
import { REQ_PER_MIN, TAG_MAX_OUTPUT_TOKENS } from "@/lib/constants";
import { resetRateLimits } from "@/server/ratelimit";
import { POST } from "./route";

const createOpenAI = vi.hoisted(() => vi.fn());
vi.mock("@/server/openai", () => ({ createOpenAI }));

describe("tag route validation", () => {
  beforeEach(() => {
    resetRateLimits();
    createOpenAI.mockReset();
    delete process.env.OPENAI_API_KEY;
  });
  it("rejects a request without chat history", async () => {
    const request = new Request("http://localhost/api/tag", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: "s", code: "x", history: [] }) });
    expect((await POST(request)).status).toBe(400);
  });
  it("rate limits the public tag endpoint", async () => {
    const body = { sessionId: "s", code: "x", history: [{ role: "student", content: "why" }] };
    for (let index = 0; index < REQ_PER_MIN; index += 1) {
      await POST(new Request("http://localhost/api/tag", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-vercel-forwarded-for": "203.0.113.7" },
        body: JSON.stringify(body),
      }));
    }
    const response = await POST(new Request("http://localhost/api/tag", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-vercel-forwarded-for": "203.0.113.7" },
      body: JSON.stringify(body),
    }));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBeTruthy();
  });
  it("returns a schema-valid record and maps an unknown category to other", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({
        category: "index-arithmetic-error", confidence: 0.7, evidenceTurn: 1, freeText: null,
      }) } }],
    });
    createOpenAI.mockReturnValue({ chat: { completions: { create } } });
    const response = await POST(new Request("http://localhost/api/tag", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "s", code: "print(1)", history: [{ role: "student", content: "Why?" }],
      }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      category: "other", freeText: "index-arithmetic-error", confidence: 0.7, evidenceTurn: 1,
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      max_completion_tokens: TAG_MAX_OUTPUT_TOKENS,
      response_format: expect.objectContaining({ type: "json_schema" }),
    }), expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });
});
