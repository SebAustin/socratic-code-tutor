import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("tag route validation", () => {
  it("rejects a request without chat history", async () => {
    const request = new Request("http://localhost/api/tag", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: "s", code: "x", history: [] }) });
    expect((await POST(request)).status).toBe(400);
  });
});
