export type HintRung = 1 | 2 | 3 | 4;

export const HINTS: Record<HintRung, { label: string; directive: string }> = {
  1: {
    label: "Concept",
    directive: "Ask one conceptual question that tests the student's mental model.",
  },
  2: {
    label: "Localize",
    directive: "Point to the relevant line, variable, or trace moment without describing the fix.",
  },
  3: {
    label: "Mechanism",
    directive: "Name the underlying language mechanism, then ask the student to apply it.",
  },
  4: {
    label: "Scaffold",
    directive: "Offer a one-line, non-runnable pseudocode scaffold and ask the student to write the change.",
  },
};

export function initialRung(): HintRung {
  return 1;
}

export function advanceRung(
  current: HintRung,
  action: { requested: boolean },
): HintRung {
  if (!action.requested) return current;
  return Math.min(4, current + 1) as HintRung;
}
