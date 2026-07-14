import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_OUTPUT_TOKENS } from "@/lib/constants";
import { parseSseBlock } from "@/lib/sse";
import { resetRateLimits } from "@/server/ratelimit";
import { SAFE_FALLBACK } from "./guardrail";

const createOpenAI = vi.hoisted(() => vi.fn());
vi.mock("@/server/openai", () => ({ createOpenAI }));

import { POST } from "@/app/api/tutor/route";

const studentCode = `def total(nums):
    s = 0
    for i in range(len(nums)):
        s = s + nums[i + 1]
    return s`;

const valid = {
  sessionId: "guardrail-integration",
  code: studentCode,
  run: { stdout: "", stderr: "IndexError", error: null, status: "error" },
  traceSummary: "i is 2 on line 4",
  history: [],
  requestedRung: 2,
  lang: "python",
};

function installModelStream(deltas: string[]) {
  const abort = vi.fn();
  const modelStream = {
    controller: { abort },
    async *[Symbol.asyncIterator]() {
      for (const content of deltas) {
        yield { choices: [{ delta: { content } }] };
      }
    },
  };
  const create = vi.fn().mockResolvedValue(modelStream);
  createOpenAI.mockReturnValue({ chat: { completions: { create } } });
  return { abort, create };
}

async function runRoute(deltas: string[], body = valid) {
  const sdk = installModelStream(deltas);
  const request = new Request("http://localhost/api/tutor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const response = await POST(request);
  const events = (await response.text())
    .split("\n\n")
    .map(parseSseBlock)
    .filter((event) => event !== null);
  return { ...sdk, events };
}

function visibleChunks(events: Awaited<ReturnType<typeof runRoute>>["events"]): string[] {
  return events.flatMap((event) => event && "chunk" in event ? [event.chunk] : []);
}

function expectFlagged(result: Awaited<ReturnType<typeof runRoute>>, forbidden: string[]) {
  const visible = visibleChunks(result.events).join("");
  expect(visible).toContain(SAFE_FALLBACK);
  forbidden.forEach((value) => expect(visible).not.toContain(value));
  expect(result.events).toContainEqual({ done: true, rung: 2, flagged: true });
  expect(result.abort).toHaveBeenCalledOnce();
}

describe("guardrail route integration", () => {
  beforeEach(() => {
    resetRateLimits();
    createOpenAI.mockReset();
    process.env.OPENAI_API_KEY = "test-key";
  });

  it("blocks a full solution injected in one delta and stops the turn", async () => {
    const result = await runRoute([
      "What does the trace show? ",
      "Here is the fix: `return sum(nums)`. ",
      "THIS MUST NEVER BE FLUSHED. ",
    ]);
    expectFlagged(result, ["return sum(nums)", "THIS MUST NEVER BE FLUSHED"]);
  });

  it("blocks a solution split across chunk and sentence boundaries", async () => {
    const result = await runRoute([
      "Start with the trace. ",
      "Try replacing line 4 ",
      "with `s = s + ",
      "nums[i]`. ",
      "AFTER FLAG. ",
    ]);
    expectFlagged(result, ["s = s + nums[i]", "AFTER FLAG"]);
  });

  it("blocks runnable solution code streamed line-by-line", async () => {
    const result = await runRoute([
      "def total(nums):\n",
      "    return sum(nums)\n",
      "AFTER FLAG\n",
    ]);
    expectFlagged(result, ["def total", "return sum(nums)", "AFTER FLAG"]);
  });

  it("detects a three-line echo cumulatively across flush boundaries", async () => {
    const body = { ...valid, code: "first value\nsecond value\nthird value" };
    const result = await runRoute(["first value\n", "second value\n", "third value\n"], body);
    expect(result.events).toContainEqual({ done: true, rung: 2, flagged: true });
    expect(result.abort).toHaveBeenCalledOnce();
  });

  it("passes a clean Socratic reply through unchanged", async () => {
    const clean = "What value does `i` have on the final loop iteration? ";
    const result = await runRoute(["What value does `i` have ", "on the final loop iteration? "]);
    expect(visibleChunks(result.events)).toEqual([clean]);
    expect(result.events).toContainEqual({ done: true, rung: 2, flagged: false });
    expect(result.abort).not.toHaveBeenCalled();
    expect(result.create).toHaveBeenCalledWith(expect.objectContaining({
      max_completion_tokens: MAX_OUTPUT_TOKENS,
    }), expect.objectContaining({ signal: expect.any(AbortSignal) }));
    const params = result.create.mock.calls[0][0] as { messages: Array<{ content: string }> };
    expect(params.messages[1].content).toContain("<<<STUDENT_CODE>>>\n");
    expect(params.messages[1].content).toContain("\n<<<END_STUDENT_CODE>>>");
  });

  it("aborts the upstream SDK stream when the client disconnects", async () => {
    let releaseModel = () => {};
    const waiting = new Promise<void>((resolve) => { releaseModel = resolve; });
    const abort = vi.fn(releaseModel);
    const modelStream = {
      controller: { abort },
      async *[Symbol.asyncIterator]() {
        yield { choices: [{ delta: { content: "What do you observe? " } }] };
        await waiting;
      },
    };
    const create = vi.fn().mockResolvedValue(modelStream);
    createOpenAI.mockReturnValue({ chat: { completions: { create } } });
    const requestAbort = new AbortController();
    const request = new Request("http://localhost/api/tutor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(valid),
      signal: requestAbort.signal,
    });

    await POST(request);
    requestAbort.abort("client-disconnected");

    await vi.waitFor(() => expect(abort).toHaveBeenCalledOnce());
    const options = create.mock.calls[0][1] as { signal: AbortSignal };
    expect(options.signal.aborted).toBe(true);
  });
});
