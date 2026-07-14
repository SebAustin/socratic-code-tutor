import type { Session } from "@/features/session/types";
import { aggregate } from "./aggregate";

export function reportAsJson(sessions: Session[]): string {
  return JSON.stringify(
    { exportedAt: new Date().toISOString(), aggregate: aggregate(sessions), sessions },
    null,
    2,
  );
}

export function reportAsMarkdown(sessions: Session[]): string {
  const counts = aggregate(sessions);
  const summary = Object.entries(counts)
    .map(([category, count]) => `- ${category.replaceAll("_", " ")}: ${count}`)
    .join("\n");
  const transcripts = sessions
    .map(
      (session) =>
        `## ${session.title}\n\n${session.chat.map((turn) => `**${turn.role}:** ${turn.content}`).join("\n\n")}`,
    )
    .join("\n\n");
  return `# Socratic Code Tutor report\n\n${summary}\n\n${transcripts}\n`;
}

export function downloadText(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
