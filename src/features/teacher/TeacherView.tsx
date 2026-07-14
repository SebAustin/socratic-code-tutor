"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { aggregate } from "./aggregate";
import { downloadText, reportAsJson, reportAsMarkdown } from "./export";
import { useSessionStore } from "@/features/session/store";
import type { MisconceptionRecord, Session } from "@/features/session/types";

const LABELS: Record<MisconceptionRecord["category"], string> = {
  off_by_one: "Off-by-one",
  mutation_vs_copy: "Mutation vs copy",
  scope_confusion: "Scope confusion",
  type_coercion: "Type coercion",
  operator_precedence: "Operator precedence",
  loop_condition: "Loop condition",
  mutable_default_arg: "Mutable default",
  other: "Other",
};

const COLORS: Record<MisconceptionRecord["category"], string> = {
  off_by_one: "var(--tag-off-by-one)", mutation_vs_copy: "var(--tag-mutation-copy)", scope_confusion: "var(--tag-scope)", type_coercion: "var(--tag-type-coercion)", operator_precedence: "var(--tag-operator-prec)", loop_condition: "var(--rung-3)", mutable_default_arg: "var(--rung-4)", other: "var(--tag-other)",
};

export function TeacherView() {
  const sessions = useSessionStore((state) => state.sessions);
  const hydrated = useSessionStore((state) => state.hydrated);
  const hydrate = useSessionStore((state) => state.hydrate);
  const deleteSession = useSessionStore((state) => state.deleteSession);
  const [openSession, setOpenSession] = useState<Session | null>(null);
  useEffect(() => { if (!hydrated) hydrate(); }, [hydrate, hydrated]);
  const meaningful = sessions.filter((session) => session.code || session.runs.length || session.chat.length);
  const counts = useMemo(() => aggregate(meaningful), [meaningful]);
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]) as [MisconceptionRecord["category"], number][];
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const max = Math.max(1, ...Object.values(counts));

  return (
    <div className="teacher-page" data-hydrated={hydrated}>
      <header className="teacher-header"><Link className="button ghost" href="/">← Back to workbench</Link><div><p className="kicker">Local browser report</p><h1>Teacher view</h1></div><div className="teacher-actions"><button className="button" disabled={!meaningful.length} onClick={() => downloadText("socratic-report.json", reportAsJson(meaningful), "application/json")}>Export JSON</button><button className="button" disabled={!meaningful.length} onClick={() => downloadText("socratic-report.md", reportAsMarkdown(meaningful), "text/markdown")}>Export Markdown</button></div></header>
      <main id="main-content" className="teacher-main">
        {!meaningful.length ? <section className="teacher-empty"><span className="brand-mark">⌗</span><h2>No sessions yet.</h2><p>Run a sample in the workbench to start building a report.</p><Link className="button primary" href="/">Try a sample →</Link></section> : <>
          <section className="report-card"><div className="report-title"><div><p className="kicker">Misconception ledger</p><h2>What is getting in the way?</h2></div><span className="report-total">{total} tag{total === 1 ? "" : "s"}</span></div><div className="bar-chart">{sorted.map(([category, count]) => <div className="bar-row" key={category}><span>{LABELS[category]}</span><div className="bar-track"><span className="bar-fill" style={{ width: `${(count / max) * 100}%`, background: COLORS[category] }} /></div><strong>{count}</strong><small>{total ? Math.round((count / total) * 100) : 0}%</small></div>)}</div></section>
          <section className="session-ledger"><div className="sample-heading"><div><p className="kicker">Session ledger</p><h2>Recent debugging conversations</h2></div><span className="mono-label">{meaningful.length} saved locally</span></div>{meaningful.map((item) => <article className="session-card" key={item.id}><div><span className="kicker">{new Date(item.createdAt).toLocaleDateString()}</span><h3>{item.title}</h3><p>{item.runs.length} run{item.runs.length === 1 ? "" : "s"} · {item.chat.length} turns</p></div><div className="session-tags">{item.tags.length ? item.tags.map((tag, index) => <span className="tag-chip" style={{ borderColor: COLORS[tag.category] }} key={`${tag.category}-${index}`}>{LABELS[tag.category]}</span>) : <span className="tag-chip muted">Awaiting tutor tag</span>}</div><div className="session-card-actions"><button className="button" onClick={() => setOpenSession(item)}>View transcript</button><button className="button ghost danger" onClick={() => { if (confirm("Delete this session? This can't be undone.")) deleteSession(item.id); }}>Delete</button></div></article>)}</section>
        </>}
      </main>
      {openSession ? <div className="drawer-backdrop" onMouseDown={() => setOpenSession(null)}><section className="drawer transcript" role="dialog" aria-modal="true" aria-label={`${openSession.title} transcript`} onMouseDown={(event) => event.stopPropagation()}><div className="drawer-head"><div><p className="kicker">Transcript</p><h2>{openSession.title}</h2></div><button className="button ghost" onClick={() => setOpenSession(null)}>Close ✕</button></div>{openSession.chat.map((turn, index) => <article className={`chat-message ${turn.role}`} key={index}><span className="message-role">{turn.role}</span>{turn.content}</article>)}</section></div> : null}
    </div>
  );
}
