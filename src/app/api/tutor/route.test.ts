import { beforeEach, describe, expect, it } from "vitest";
import { MAX_CODE_LEN, MAX_TURNS_PER_SESSION } from "@/lib/constants";
import { resetRateLimits } from "@/server/ratelimit";
import { POST } from "./route";

function request(body: unknown) {
  return new Request("http://localhost/api/tutor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

const valid = { sessionId: "s1", code: "print(1)", run: { stdout: "1", stderr: "", error: null, status: "ok" }, traceSummary: "line 1", history: [], requestedRung: 1, lang: "python" };

describe("tutor route validation", () => {
  beforeEach(resetRateLimits);
  it("rejects malformed bodies", async () => expect((await POST(request({ code: "x" }))).status).toBe(400));
  it("rejects code over the maximum", async () => expect((await POST(request({ ...valid, code: "x".repeat(MAX_CODE_LEN + 1) }))).status).toBe(400));
  it("rejects a rung above the ceiling", async () => expect((await POST(request({ ...valid, requestedRung: 5 }))).status).toBe(400));
  it("rejects the turn after the per-session ceiling", async () => {
    const history = Array.from({ length: MAX_TURNS_PER_SESSION + 1 }, (_, index) => ({ role: "student", content: `turn ${index}` }));
    expect((await POST(request({ ...valid, history }))).status).toBe(429);
  });
  it("returns a generic configuration error without exposing a key", async () => {
    const response = await POST(request(valid));
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toMatch(/OPENAI_API_KEY|sk-/);
  });
});
