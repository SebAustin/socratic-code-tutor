import type { Page } from "@playwright/test";

export async function installMockRuntime(page: Page) {
  await page.addInitScript(() => {
    class MockWorker extends EventTarget {
      constructor() {
        super();
        setTimeout(() => this.dispatchEvent(new MessageEvent("message", { data: { type: "ready" } })), 10);
      }
      postMessage(request: { id: string; code: string }) {
        const fails = request.code.includes("i + 1");
        const result = {
          type: "result", id: request.id, stdout: fails ? "" : "6\n", stderr: fails ? "IndexError: list index out of range" : "",
          error: fails ? { excType: "IndexError", message: "list index out of range", line: 4 } : null,
          status: fails ? "error" : "ok", durationMs: 8,
          trace: [
            { step: 0, line: 1, event: "call", depth: 0, func: "<module>", locals: {} },
            { step: 1, line: 3, event: "line", depth: 1, func: "total", locals: { nums: "[1, 2, 3]", s: "0" } },
            { step: 2, line: 4, event: "line", depth: 1, func: "total", locals: { i: "2", s: "3" } },
          ],
        };
        setTimeout(() => this.dispatchEvent(new MessageEvent("message", { data: result })), 20);
      }
      terminate() {}
    }
    Object.defineProperty(window, "Worker", { configurable: true, value: MockWorker });
  });
}

export async function mockTutorApis(page: Page) {
  await page.route("**/api/tutor", (route) => route.fulfill({
    status: 200,
    contentType: "text/event-stream",
    body: `data: {"chunk":"What value does i + 1 have on the final loop iteration?"}\n\ndata: {"done":true,"rung":1,"flagged":false}\n\n`,
  }));
  await page.route("**/api/tag", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ category: "off_by_one", confidence: 0.94, evidenceTurn: 1 }),
  }));
}
