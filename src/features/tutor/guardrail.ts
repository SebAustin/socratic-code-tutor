import {
  GUARDRAIL_SIMILARITY_THRESHOLD,
  GUARDRAIL_SIMILAR_LINES_N,
} from "@/lib/constants";
import { lineSimilarity, normalizeLine } from "@/lib/similarity";
import type { HintRung } from "./hintLadder";

export type ScreenResult = { pass: true } | { pass: false; reason: string };

export const SAFE_FALLBACK =
  "I won't hand you the fixed code, but I can help you find it — which value in the trace first differs from what you expected?";

export function screenForClient(text: string, studentCode: string, rung: HintRung) {
  const result = screen(text, studentCode, rung);
  return result.pass
    ? { chunk: text, flagged: false, reason: null }
    : { chunk: SAFE_FALLBACK, flagged: true, reason: result.reason };
}

function fencedBlocks(text: string): string[] {
  return [...text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((match) => match[1]);
}

function onlyQuotesStudentCode(block: string, studentCode: string): boolean {
  const studentLines = new Set(studentCode.split("\n").map(normalizeLine).filter(Boolean));
  const blockLines = block.split("\n").map(normalizeLine).filter(Boolean);
  return blockLines.length > 0 && blockLines.every((line) => studentLines.has(line));
}

function hasLongCodeEcho(text: string, studentCode: string): boolean {
  if (text.split("\n").length < GUARDRAIL_SIMILAR_LINES_N) return false;
  const studentLines = studentCode.split("\n").map(normalizeLine).filter(Boolean);
  let streak = 0;
  for (const line of text.split("\n")) {
    const normalized = normalizeLine(line.replace(/^```\w*|```$/g, ""));
    if (!normalized || normalized.length < 4) {
      streak = 0;
      continue;
    }
    const similar = studentLines.some(
      (studentLine) => lineSimilarity(normalized, studentLine) >= GUARDRAIL_SIMILARITY_THRESHOLD,
    );
    streak = similar ? streak + 1 : 0;
    if (streak >= GUARDRAIL_SIMILAR_LINES_N) return true;
  }
  return false;
}

export function screen(text: string, studentCode: string, rung: HintRung): ScreenResult {
  const fenceCount = text.match(/```/g)?.length ?? 0;
  if (fenceCount % 2 !== 0) return { pass: false, reason: "unclosed-fence" };

  const blocks = fencedBlocks(text);
  for (const block of blocks) {
    const quote = onlyQuotesStudentCode(block, studentCode) && /\?\s*$/.test(text.trim());
    if (!quote) return { pass: false, reason: "fenced-code rung-ceiling" };
  }

  if (/\b(replace|change|rewrite|fix)\s+(?:line\s+\d+|it|this)?\s*(?:with|to|as)\b/i.test(text)) {
    return { pass: false, reason: "imperative-fix" };
  }
  if (/\b(?:here(?:'s| is)\s+(?:the|a)\s+(?:fix|solution)|copy\s+and\s+paste)\b/i.test(text)) {
    return { pass: false, reason: "direct-solution" };
  }
  if (hasLongCodeEcho(text, studentCode) && blocks.length === 0) {
    return { pass: false, reason: "similar-lines" };
  }

  if (rung < 4 && /^\s*(?:def |class |import |from \S+ import |for |while |if ).*$/m.test(text)) {
    return { pass: false, reason: "rung-ceiling runnable-code" };
  }
  if (rung === 4 && /pseudocode\s*:\s*\n(?:[^\n]+\n){1,}/i.test(text)) {
    return { pass: false, reason: "rung-ceiling multi-line-pseudocode" };
  }

  return { pass: true };
}
