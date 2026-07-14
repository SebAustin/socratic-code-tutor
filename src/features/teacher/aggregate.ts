import type { MisconceptionRecord, Session } from "@/features/session/types";
import { CATEGORIES } from "./tagParsing";

export type AggregateCounts = Record<MisconceptionRecord["category"], number>;

export function aggregate(sessions: Session[]): AggregateCounts {
  const counts = Object.fromEntries(CATEGORIES.map((category) => [category, 0])) as AggregateCounts;
  for (const session of sessions) {
    for (const tag of session.tags) counts[tag.category] += 1;
  }
  return counts;
}
