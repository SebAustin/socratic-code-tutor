import { z } from "zod";
import type { MisconceptionRecord } from "@/features/session/types";

export const CATEGORIES = [
  "off_by_one",
  "mutation_vs_copy",
  "scope_confusion",
  "type_coercion",
  "operator_precedence",
  "loop_condition",
  "mutable_default_arg",
  "other",
] as const;

const RawTagSchema = z.object({
  category: z.string().min(1),
  freeText: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1),
  evidenceTurn: z.number().int().nonnegative(),
});

export function parseTagResponse(payload: unknown): MisconceptionRecord {
  const parsed = RawTagSchema.parse(payload);
  if (CATEGORIES.includes(parsed.category as (typeof CATEGORIES)[number])) {
    const { freeText, ...record } = parsed;
    return { ...record, ...(freeText ? { freeText } : {}) } as MisconceptionRecord;
  }
  return {
    category: "other",
    freeText: parsed.category,
    confidence: parsed.confidence,
    evidenceTurn: parsed.evidenceTurn,
  };
}
