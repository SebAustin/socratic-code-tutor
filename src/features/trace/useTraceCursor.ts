"use client";

import { useMemo, useState } from "react";
import type { TraceEvent } from "@/features/session/types";

export function useTraceCursor(events: TraceEvent[]) {
  const [index, setIndex] = useState(0);
  const safeIndex = Math.min(index, Math.max(0, events.length - 1));
  const current = useMemo(() => events[safeIndex] ?? null, [events, safeIndex]);
  const move = (next: number) => setIndex(Math.max(0, Math.min(next, Math.max(0, events.length - 1))));
  return { index: safeIndex, current, move, canBack: safeIndex > 0, canForward: safeIndex < events.length - 1 };
}
