import { expect, test } from "@playwright/test";

test("@live deployed tutor returns an SSE response", async ({ request }) => {
  const response = await request.post("/api/tutor", {
    data: {
      sessionId: "live-smoke", code: "print(1 / 0)",
      run: { stdout: "", stderr: "ZeroDivisionError", error: { excType: "ZeroDivisionError", message: "division by zero", line: 1 }, status: "error" },
      traceSummary: "line 1 exception", history: [], requestedRung: 1, lang: "python",
    },
  });
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/event-stream");
});
