import type { TutorSseEvent } from "@/features/session/types";

const encoder = new TextEncoder();

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
  return JSON.parse(data) as TutorSseEvent;
}
