import {
  LOCALS_REPR_MAXLEN,
  PERSISTED_TRACE_MAX_EVENTS,
  TRACE_SUMMARY_TOKEN_BUDGET,
} from "@/lib/constants";
import type { TraceEvent } from "@/features/session/types";

export function capTrace(
  events: TraceEvent[],
  limit = PERSISTED_TRACE_MAX_EVENTS,
): TraceEvent[] {
  if (events.length <= limit) return events;
  if (limit <= 1) return [events[0]];
  return Array.from({ length: limit }, (_, index) => {
    const sourceIndex = Math.round((index * (events.length - 1)) / (limit - 1));
    return events[sourceIndex];
  });
}

function trimRepr(value: string): string {
  if (value.length <= LOCALS_REPR_MAXLEN) return value;
  return `${value.slice(0, LOCALS_REPR_MAXLEN - 1)}…`;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function summarizeTrace(events: TraceEvent[]): string {
  const sampled = capTrace(events, Math.min(events.length, 180));
  const lines: string[] = [];

  for (const event of sampled) {
    const locals = Object.entries(event.locals)
      .map(([key, value]) => `${key}=${trimRepr(value)}`)
      .join(", ");
    const line = `#${event.step} ${event.event} line ${event.line} ${event.func} depth=${event.depth}${locals ? ` | ${locals}` : ""}`;
    if (estimateTokens([...lines, line].join("\n")) > TRACE_SUMMARY_TOKEN_BUDGET) break;
    lines.push(line);
  }

  return lines.join("\n") || "No trace events were captured.";
}
