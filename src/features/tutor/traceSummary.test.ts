import { describe, expect, it } from "vitest";
import { LOCALS_REPR_MAXLEN, PERSISTED_TRACE_MAX_EVENTS, TRACE_SUMMARY_TOKEN_BUDGET } from "@/lib/constants";
import { capTrace, estimateTokens, summarizeTrace } from "./traceSummary";
import type { TraceEvent } from "@/features/session/types";

const events = (count: number): TraceEvent[] => Array.from({ length: count }, (_, step) => ({ step, line: step % 12 + 1, event: "line", depth: 0, func: "<module>", locals: { i: String(step) } }));

describe("trace summarization", () => {
  it("stays inside the token budget", () => expect(estimateTokens(summarizeTrace(events(500)))).toBeLessThanOrEqual(TRACE_SUMMARY_TOKEN_BUDGET));
  it("truncates long local representations", () => {
    const summary = summarizeTrace([{ ...events(1)[0], locals: { big: "x".repeat(400) } }]);
    expect(summary).toContain("…");
    expect(summary.match(/big=(x+…)/)?.[1].length).toBeLessThanOrEqual(LOCALS_REPR_MAXLEN);
  });
  it("caps traces with first and last bias", () => {
    const capped = capTrace(events(2_000));
    expect(capped).toHaveLength(PERSISTED_TRACE_MAX_EVENTS);
    expect(capped[0].step).toBe(0);
    expect(capped.at(-1)?.step).toBe(1_999);
  });
  it("leaves short traces unchanged", () => expect(capTrace(events(3)).map(({ step }) => step)).toEqual([0, 1, 2]));
});
