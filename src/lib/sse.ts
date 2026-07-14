import { z } from "zod";
import type { TutorSseEvent } from "@/features/session/types";

const encoder = new TextEncoder();
const TutorSseEventSchema = z.union([
  z.object({ chunk: z.string() }).strict(),
  z.object({ done: z.literal(true), rung: z.number().int(), flagged: z.boolean() }).strict(),
  z.object({ error: z.string() }).strict(),
]);

export function encodeSse(event: TutorSseEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

export function hasCompleteScreenBoundary(text: string): boolean {
  const fences = text.match(/```/g)?.length ?? 0;
  if (fences > 0) return fences % 2 === 0 && /```\s*$/.test(text);
  return /[.!?](?:["')\]]*)\s+$/.test(text) || /\n\s*$/.test(text);
}

export function parseSseBlock(block: string): TutorSseEvent | null {
  const data = block
    .split("\n")
    .find((line) => line.startsWith("data: "))
    ?.slice(6);
  if (!data) return null;
  try {
    const parsed = TutorSseEventSchema.safeParse(JSON.parse(data));
    if (parsed.success) return parsed.data;
  } catch {
    // Fall through to the shared warning for malformed JSON and malformed shapes.
  }
  console.warn("[tutor-sse] skipped malformed event");
  return null;
}
