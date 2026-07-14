import { describe, expect, it } from "vitest";
import { lineSimilarity, normalizeLine } from "./similarity";

describe("line similarity", () => {
  it("normalizes surrounding and repeated whitespace", () => {
    expect(normalizeLine("  total  =   1 ")).toBe("total = 1");
  });
  it("returns one for equal normalized lines", () => {
    expect(lineSimilarity("x = 1", " x   = 1 ")).toBe(1);
  });
  it("returns zero when only one side is empty", () => {
    expect(lineSimilarity("", "value")).toBe(0);
  });
  it("scores small edits above unrelated text", () => {
    expect(lineSimilarity("nums[i + 1]", "nums[i]")).toBeGreaterThan(lineSimilarity("nums[i + 1]", "print('hi')"));
  });
});
