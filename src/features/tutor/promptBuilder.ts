import { MAX_TURNS_PER_SESSION } from "@/lib/constants";
import { HINTS } from "./hintLadder";
import { SYSTEM_PROMPT } from "@/server/systemPrompt";
import type { TutorRequest } from "@/features/session/types";

export type PromptMessage = { role: "system" | "user"; content: string };

function delimited(name: string, value: string): string {
  return `<<<${name}>>>\n${value}\n<<<END_${name}>>>`;
}

export function buildTutorMessages(request: TutorRequest): PromptMessage[] {
  const history = request.history
    .slice(-MAX_TURNS_PER_SESSION)
    .map((turn) => `${turn.role.toUpperCase()}: ${turn.content}`)
    .join("\n");
  const runOutput = JSON.stringify(request.run, null, 2);

  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        `Requested hint rung ${request.requestedRung} of 4 (${HINTS[request.requestedRung].label}).`,
        HINTS[request.requestedRung].directive,
        delimited("STUDENT_CODE", request.code),
        delimited("RUN_OUTPUT", runOutput),
        delimited("TRACE", request.traceSummary),
        delimited("STUDENT_HISTORY", history || "No prior turns."),
        "Respond with the next Socratic tutor turn only.",
      ].join("\n\n"),
    },
  ];
}
