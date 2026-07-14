import { describe, expect, it } from "vitest";
import { SAFE_FALLBACK, screen, screenForClient } from "./guardrail";

const studentCode = `def total(nums):
    s = 0
    for i in range(len(nums)):
        s = s + nums[i + 1]
    return s`;

describe("screen() — primary rules", () => {
  it("flags a complete fenced fix block", () => {
    const result = screen("Try this:\n```python\ndef total(nums):\n    return sum(nums)\n```", studentCode, 2);
    expect(result.pass).toBe(false);
    if (!result.pass) expect(result.reason).toContain("fenced-code");
  });
  it("flags imperative-fix phrasing", () => {
    const result = screen("Replace line 4 with `s = s + nums[i]`.", studentCode, 2);
    expect(result.pass).toBe(false);
    if (!result.pass) expect(result.reason).toContain("imperative-fix");
  });
  it("passes a fenced quote of the student's unchanged line", () => {
    expect(screen("You wrote:\n```python\ns = s + nums[i + 1]\n```\nWhat happens on the final iteration?", studentCode, 2).pass).toBe(true);
  });
  it("withholds an unclosed fence", () => {
    const result = screen("```python\ndef fix", studentCode, 4);
    expect(result.pass).toBe(false);
    if (!result.pass) expect(result.reason).toContain("unclosed-fence");
  });
});

describe("screen() — rung rules", () => {
  it.each([1, 2, 3] as const)("rung %i flags non-student fenced code", (rung) => {
    const result = screen("```python\nprint('answer')\n```", studentCode, rung);
    expect(result.pass).toBe(false);
    if (!result.pass) expect(result.reason).toContain("rung-ceiling");
  });
  it("rung 4 flags multi-line pseudocode", () => expect(screen("Pseudocode:\nindex = current\ntotal = total + item", studentCode, 4).pass).toBe(false));
  it("rung 4 passes one inline pseudocode expression", () => expect(screen("Pseudocode: `new_index = current_index - 1` — what would that change?", studentCode, 4).pass).toBe(true));
  it("passes a conceptual question", () => expect(screen("What values does `range(len(nums))` produce, and which one is last?", studentCode, 2).pass).toBe(true));
  it("passes a question quoting one student line", () => expect(screen("You wrote `s = s + nums[i + 1]` — what is i on the final iteration?", studentCode, 2).pass).toBe(true));
});

describe("buffered pipeline invariant", () => {
  it("substitutes the fallback instead of exposing a mid-stream solution", () => {
    const result = screenForClient("Actually, here's the fix:\n```python\ndef total(nums):\n    return sum(nums)\n```", studentCode, 2);
    expect(result.flagged).toBe(true);
    expect(result.chunk).toBe(SAFE_FALLBACK);
    expect(result.chunk).not.toContain("sum(nums)");
  });
  it("screens ten adversarial solution-shaped outputs", () => {
    const attempts = [
      "Here is the solution: `return sum(nums)`.", "Copy and paste this: `return sum(nums)`.",
      "Replace line 4 with `s += nums[i]`.", "Change it to `nums[i]`.",
      "```python\nreturn sum(nums)\n```", "```\ns += nums[i]\n```",
      "Here is a fix: use `sum(nums)`.", "Rewrite line 4 as `s = s + nums[i]`.",
      "```python\ndef total(nums):\n return sum(nums)\n```", "The solution is below:\n```python\nprint(6)\n```",
    ];
    expect(attempts.filter((text) => screenForClient(text, studentCode, 2).chunk.includes("sum(nums)")).length).toBe(0);
    expect(attempts.every((text) => screenForClient(text, studentCode, 2).flagged)).toBe(true);
  });
  it("completes within 5ms for a long response", () => {
    const text = "What value do you expect from the final iteration? ".repeat(140);
    const start = performance.now();
    screen(text, studentCode, 2);
    const elapsed = performance.now() - start;
    console.log(`[guardrail] 700-token-style response screened in ${elapsed.toFixed(3)}ms`);
    expect(elapsed).toBeLessThan(5);
  });
});
