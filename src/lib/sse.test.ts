import { describe, expect, it } from "vitest";
import { encodeSse, hasCompleteScreenBoundary, parseSseBlock } from "./sse";

describe("SSE utilities", () => {
  it("encodes and parses a chunk event", () => {
    const text = new TextDecoder().decode(encodeSse({ chunk: "Why?" }));
    expect(parseSseBlock(text.trim())).toEqual({ chunk: "Why?" });
  });
  it("recognizes a sentence boundary", () => expect(hasCompleteScreenBoundary("What happens next? ")).toBe(true));
  it("withholds an open code fence", () => expect(hasCompleteScreenBoundary("```python\nx = 1\n")).toBe(false));
  it("releases a complete code fence for screening", () => expect(hasCompleteScreenBoundary("```python\nx = 1\n```" )).toBe(true));
});
