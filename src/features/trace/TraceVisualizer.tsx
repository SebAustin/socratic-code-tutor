"use client";

import { useEffect } from "react";
import type { TraceEvent } from "@/features/session/types";
import { useTraceCursor } from "./useTraceCursor";

export function TraceVisualizer({
  events,
  code,
  onLineChange,
}: {
  events: TraceEvent[];
  code: string;
  onLineChange?: (line: number | null) => void;
}) {
  const cursor = useTraceCursor(events);
  const currentLine = cursor.current?.line ?? null;
  useEffect(() => onLineChange?.(currentLine), [currentLine, onLineChange]);

  if (!cursor.current) {
    return <div className="empty-terminal">No trace yet — run your code to generate one.</div>;
  }
  const lineText = code.split("\n")[cursor.current.line - 1]?.trim() ?? "";

  return (
    <div className="trace-view">
      <div className="trace-meta">
        <span>step {cursor.index + 1} / {events.length}</span>
        <span>line {cursor.current.line}</span>
        <span>{cursor.current.event} · {cursor.current.func} · depth {cursor.current.depth}</span>
      </div>
      <div className="trace-code" aria-label={`Current trace line ${cursor.current.line}`}>
        <span>{cursor.current.line}</span> {lineText || "(function boundary)"}
      </div>
      <label className="trace-slider-label" htmlFor="trace-scrubber">Execution timeline</label>
      <input
        id="trace-scrubber"
        className="trace-slider"
        type="range"
        min={0}
        max={Math.max(0, events.length - 1)}
        value={cursor.index}
        onChange={(event) => cursor.move(Number(event.target.value))}
        aria-valuetext={`Step ${cursor.index + 1} of ${events.length}, line ${cursor.current.line}`}
      />
      <div className="trace-controls">
        <button className="button terminal-button" onClick={() => cursor.move(cursor.index - 1)} disabled={!cursor.canBack}>← Back</button>
        <button className="button terminal-button" onClick={() => cursor.move(cursor.index + 1)} disabled={!cursor.canForward}>Forward →</button>
      </div>
      <div className="variable-table" role="table" aria-label="Variables in scope">
        <div className="variable-row variable-head" role="row"><span role="columnheader">Variable</span><span role="columnheader">Value</span></div>
        {Object.entries(cursor.current.locals).length ? Object.entries(cursor.current.locals).map(([key, value]) => (
          <div className="variable-row" role="row" key={key}><code role="cell">{key}</code><code role="cell">{value}</code></div>
        )) : <div className="variable-row"><span>—</span><span>No local values yet</span></div>}
      </div>
    </div>
  );
}
