"use client";

import { useState } from "react";
import { HINTS } from "./hintLadder";
import type { Session } from "@/features/session/types";

type Props = {
  session: Session;
  streamingText: string;
  isStreaming: boolean;
  error: string | null;
  onSubmit: (content: string) => Promise<void>;
  onHint: () => Promise<void>;
};

export function TutorPanel({ session, streamingText, isStreaming, error, onSubmit, onHint }: Props) {
  const [draft, setDraft] = useState("");
  const rung = session.currentRung;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || isStreaming) return;
    setDraft("");
    await onSubmit(content);
  };
  const hintLabel = rung >= 4 ? "You've reached the last hint" : rung === 3 ? "One more nudge" : "I'm stuck — hint";

  return (
    <section className="tutor-column" aria-label="Tutor conversation">
      <div className="hint-rail" role="group" aria-label="Hint progress">
        <div className="hint-caption" id="hint-caption"><strong>{rung ? `Hint ${rung} of 4` : "Hint ladder"}</strong><span>{rung ? HINTS[rung].label : "Start with a run"}</span></div>
        <div className="hint-steps" aria-hidden="true">
          {([1, 2, 3, 4] as const).map((step) => (
            <span key={step} className={`hint-step ${step <= rung ? "active" : ""}`} style={{ "--rung-index": step, "--rung-color": `var(--rung-${step})` } as React.CSSProperties} />
          ))}
        </div>
      </div>
      <div className="chat-log" role="log" aria-live="polite" aria-relevant="additions">
        {session.chat.map((turn) => (
          <article className={`chat-message ${turn.role}`} key={turn.id}>
            <span className="message-role">{turn.role === "tutor" ? `Tutor${turn.rung ? ` · hint ${turn.rung}` : ""}` : "You"}</span>
            {turn.content}
          </article>
        ))}
        {isStreaming ? <article className="chat-message tutor"><span className="message-role">Tutor · thinking aloud</span>{streamingText || "Looking at the trace"}<span className="streaming-caret" aria-hidden="true" /></article> : null}
      </div>
      <form className="composer" onSubmit={submit}>
        {error ? <p className="chat-error">{error}</p> : null}
        <label className="mono-label" htmlFor="chat-composer">What do you think happened?</label>
        <textarea id="chat-composer" aria-describedby="hint-caption" value={draft} onChange={(event) => setDraft(event.target.value)} disabled={isStreaming} placeholder="Tell the tutor what you tried, or ask a question." />
        <div className="composer-actions">
          <button className="button" type="button" onClick={onHint} disabled={isStreaming || rung >= 4 || session.runs.length === 0}>{hintLabel}</button>
          <button className="button primary" type="submit" disabled={isStreaming || !draft.trim() || session.runs.length === 0}>Send thought →</button>
        </div>
      </form>
    </section>
  );
}
