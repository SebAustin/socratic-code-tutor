import { afterEach, describe, expect, it, vi } from "vitest";
import type { RunRequest, RunResult } from "@/features/session/types";
import { PyodideRunner } from "./pyodideRunner";

class MockWorker extends EventTarget {
  static instance: MockWorker;
  postMessage = vi.fn();
  terminate = vi.fn();

  constructor() {
    super();
    MockWorker.instance = this;
    queueMicrotask(() => this.dispatchEvent(new MessageEvent("message", { data: { type: "ready" } })));
  }
}

const request = (id: string): RunRequest => ({
  type: "run",
  id,
  code: "print(1)",
  lang: "python",
  limits: { wallMs: 5_000, maxSteps: 10_000 },
});

describe("PyodideRunner lifecycle", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects a second run while the first is pending", async () => {
    vi.stubGlobal("Worker", MockWorker);
    const runner = new PyodideRunner();
    const first = runner.run(request("first"));
    await vi.waitFor(() => expect(MockWorker.instance.postMessage).toHaveBeenCalledOnce());

    await expect(runner.run(request("second"))).rejects.toThrow("already in progress");

    const result: RunResult = {
      type: "result", id: "first", stdout: "1", stderr: "", error: null,
      trace: [], status: "ok", durationMs: 1,
    };
    MockWorker.instance.dispatchEvent(new MessageEvent("message", { data: result }));
    await expect(first).resolves.toEqual(result);
    runner.reset();
  });
});
