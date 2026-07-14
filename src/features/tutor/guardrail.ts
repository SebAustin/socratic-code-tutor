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

function isStudentFragment(candidate: string, studentCode: string): boolean {
  const normalized = normalizeLine(candidate);
  return Boolean(normalized) && studentCode
    .split("\n")
    .map(normalizeLine)
    .some((line) => line.includes(normalized));
}

function inlineCodeSpans(text: string): string[] {
  return [...text.matchAll(/(^|[^`])`([^`\n]+)`(?!`)/g)].map((match) => match[2]);
}

function isRunnableExpression(candidate: string): boolean {
  const value = candidate.trim();
  const assignment = /(?:^|[\s;(])(?:[A-Za-z_]\w*(?:\.[A-Za-z_]\w*|\[[^\]]+\])*)\s*(?:\*\*|\/\/|[+\-*/%])?=(?!=)/;
  const call = /\b[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*\s*\([^)]*\)/;
  const subscript = /\b[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*\s*\[[^\]]+\]/;
  const operator = /(?:\b[A-Za-z_]\w*\b|\d+|[\])])\s*(?:\+|-|\*{1,2}|\/{1,2}|%|==|!=|<=|>=|<|>)\s*(?:\b[A-Za-z_]\w*\b|\d+|[([])/;
  return assignment.test(value) || call.test(value) || subscript.test(value) || operator.test(value);
}

function hasBareRunnableCode(text: string): boolean {
  const proseOnly = text
    .replace(/```[^\n]*\n[\s\S]*?```/g, "")
    .replace(/`[^`\n]+`/g, "");
  return proseOnly.split("\n").some((line) => {
    const value = line.trim();
    if (!value) return false;
    if (/^(?:def |class |import |from \S+ import |for |while |if |return\b)/.test(value)) return true;
    if (/(?:^|[\s;(])(?:[A-Za-z_]\w*(?:\.[A-Za-z_]\w*|\[[^\]]+\])*)\s*(?:\*\*|\/\/|[+\-*/%])?=(?!=)/.test(value)) return true;
    return /^(?:[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*\([^)]*\)|[A-Za-z_]\w*\[[^\]]+\]|(?:[A-Za-z_]\w*|\d+)\s*(?:\+|-|\*{1,2}|\/{1,2}|%)\s*(?:[A-Za-z_]\w*|\d+))[.;]?$/.test(value);
  });
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

  if (/\b(?:chang(?:e|ing|ed)|replac(?:e|ing|ed)|rewrit(?:e|ing|ten)|fix(?:ing|ed)?|use|using)\b[\s\S]{0,100}?\b(?:with|to|as|instead)\b|\btry\s+(?:this|that|using|changing|replacing|rewriting|fixing|[A-Za-z_])/i.test(text)) {
    return { pass: false, reason: "imperative-fix" };
  }
  if (/\b(?:here(?:'s| is)\s+(?:the|a)\s+(?:fix|solution)|copy\s+and\s+paste)\b/i.test(text)) {
    return { pass: false, reason: "direct-solution" };
  }
  if (hasLongCodeEcho(text, studentCode) && blocks.length === 0) {
    return { pass: false, reason: "similar-lines" };
  }

  if (rung <= 3 && inlineCodeSpans(text).some(
    (span) => isRunnableExpression(span) && !isStudentFragment(span, studentCode),
  )) {
    return { pass: false, reason: "rung-ceiling inline-code" };
  }
  if (hasBareRunnableCode(text)) {
    return { pass: false, reason: "rung-ceiling runnable-code" };
  }
  if (rung === 4 && /pseudocode\s*:\s*\n(?:[^\n]+\n){1,}/i.test(text)) {
    return { pass: false, reason: "rung-ceiling multi-line-pseudocode" };
  }

  return { pass: true };
}
