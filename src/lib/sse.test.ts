import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeSse, hasCompleteScreenBoundary, parseSseBlock } from "./sse";

describe("SSE utilities", () => {
  afterEach(() => vi.restoreAllMocks());
  it("encodes and parses a chunk event", () => {
    const text = new TextDecoder().decode(encodeSse({ chunk: "Why?" }));
    expect(parseSseBlock(text.trim())).toEqual({ chunk: "Why?" });
  });
  it("recognizes a sentence boundary", () => expect(hasCompleteScreenBoundary("What happens next? ")).toBe(true));
  it("withholds an open code fence", () => expect(hasCompleteScreenBoundary("```python\nx = 1\n")).toBe(false));
  it("releases a complete code fence for screening", () => expect(hasCompleteScreenBoundary("```python\nx = 1\n```" )).toBe(true));
  it.each([
    "data: not-json",
    'data: {"chunk":42}',
  ])("skips and warns for a malformed event: %s", (block) => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(parseSseBlock(block)).toBeNull();
    expect(warning).toHaveBeenCalledWith("[tutor-sse] skipped malformed event");
  });
});
