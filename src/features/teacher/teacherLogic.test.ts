import { describe, expect, it } from "vitest";
import type { Session } from "@/features/session/types";
import { aggregate } from "./aggregate";
import { reportAsJson, reportAsMarkdown } from "./export";
import { parseTagResponse } from "./tagParsing";

const base = (id: string): Session => ({ id, createdAt: 1, title: id, lang: "python", code: "", runs: [], latestTrace: null, chat: [], tags: [], currentRung: 0 });

describe("misconception parsing", () => {
  it("parses a valid taxonomy record", () => expect(parseTagResponse({ category: "off_by_one", confidence: 0.82, evidenceTurn: 3 })).toEqual({ category: "off_by_one", confidence: 0.82, evidenceTurn: 3 }));
  it("maps unknown categories to other with free text", () => expect(parseTagResponse({ category: "index-arithmetic-error", confidence: 0.6, evidenceTurn: 2 })).toEqual({ category: "other", freeText: "index-arithmetic-error", confidence: 0.6, evidenceTurn: 2 }));
  it("rejects a malformed payload", () => expect(() => parseTagResponse({ category: "off_by_one", evidenceTurn: 1 })).toThrow());
});

describe("teacher aggregation and export", () => {
  const sessions = [base("a"), base("b"), base("c")];
  sessions[0].tags = [{ category: "off_by_one", confidence: 1, evidenceTurn: 1 }];
  sessions[1].tags = [{ category: "off_by_one", confidence: 1, evidenceTurn: 1 }, { category: "scope_confusion", confidence: .8, evidenceTurn: 2 }];
  sessions[2].tags = [{ category: "mutation_vs_copy", confidence: .9, evidenceTurn: 1 }];

  it("aggregates every taxonomy key with zero fill", () => {
    const counts = aggregate(sessions);
    expect(counts.off_by_one).toBe(2);
    expect(counts.mutation_vs_copy).toBe(1);
    expect(counts.operator_precedence).toBe(0);
    expect(Object.keys(counts)).toHaveLength(8);
  });
  it("produces valid JSON", () => expect(JSON.parse(reportAsJson(sessions)).sessions).toHaveLength(3));
  it("produces a readable Markdown transcript", () => expect(reportAsMarkdown(sessions)).toContain("# Socratic Code Tutor report"));
});
