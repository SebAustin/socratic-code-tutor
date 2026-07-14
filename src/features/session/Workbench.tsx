"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useModalDialog } from "@/features/a11y/useModalDialog";
import { DemoLanding } from "@/features/demo/DemoLanding";
import { SAMPLES, type DemoSample } from "@/features/demo/samples";
import { EditorPane } from "@/features/editor/EditorPane";
import { useEditorShortcuts } from "@/features/editor/useEditor";
import { useSandbox } from "@/features/sandbox/useSandbox";
import { TraceVisualizer } from "@/features/trace/TraceVisualizer";
import { TutorPanel } from "@/features/tutor/TutorPanel";
import { summarizeTrace } from "@/features/tutor/traceSummary";
import { tagSession, useTutorStream } from "@/features/tutor/useTutorStream";
import type { HintRung } from "@/features/tutor/hintLadder";
import type { RunResult, Session, TutorRequest } from "./types";
import { useSessionStore } from "./store";

function currentSession(): Session {
  const state = useSessionStore.getState();
  return state.sessions.find(({ id }) => id === state.activeSessionId) ?? state.sessions[0];
}

function sessionById(id: string): Session | undefined {
  return useSessionStore.getState().sessions.find((session) => session.id === id);
}

export function Workbench() {
  const sessions = useSessionStore((state) => state.sessions);
  const activeId = useSessionStore((state) => state.activeSessionId);
  const hydrated = useSessionStore((state) => state.hydrated);
  const hydrate = useSessionStore((state) => state.hydrate);
  const activate = useSessionStore((state) => state.activate);
  const createSession = useSessionStore((state) => state.createSession);
  const loadSample = useSessionStore((state) => state.loadSample);
  const updateCode = useSessionStore((state) => state.updateCode);
  const recordRun = useSessionStore((state) => state.recordRun);
  const appendChat = useSessionStore((state) => state.appendChat);
  const setRung = useSessionStore((state) => state.setRung);
  const addTag = useSessionStore((state) => state.addTag);
  const resetAll = useSessionStore((state) => state.resetAll);
  const session = sessions.find(({ id }) => id === activeId) ?? sessions[0];
  const { run, retry, phase, fatal } = useSandbox();
  const { askTutor, cancel: cancelTutor, isStreaming, streamingText, error } = useTutorStream();
  const [samplesOpen, setSamplesOpen] = useState(false);
  const [outputTab, setOutputTab] = useState<"output" | "trace">("output");
  const [traceLine, setTraceLine] = useState<number | null>(null);
  const closeSamples = useCallback(() => setSamplesOpen(false), []);
  const {
    setDialogElement: setSamplesDialog,
    rememberTrigger: rememberSamplesTrigger,
  } = useModalDialog(samplesOpen, closeSamples);
  const openSamples = useCallback((trigger?: HTMLElement | null) => {
    rememberSamplesTrigger(trigger);
    setSamplesOpen(true);
  }, [rememberSamplesTrigger]);

  useEffect(() => {
    if (!hydrated) hydrate(new URLSearchParams(window.location.search).get("session"));
  }, [hydrate, hydrated]);

  useEffect(() => cancelTutor, [cancelTutor]);

  useEffect(() => {
    if (!hydrated || !activeId) return;
    const url = new URL(window.location.href);
    url.searchParams.set("session", activeId);
    window.history.replaceState({}, "", url);
  }, [activeId, hydrated]);

  const talkToTutor = useCallback(async (
    result: RunResult | null,
    rung: HintRung,
    studentContent?: string,
  ) => {
    const originatingSessionId = currentSession().id;
    if (studentContent) appendChat(originatingSessionId, { role: "student", content: studentContent });
    setRung(rung);
    const snapshot = sessionById(originatingSessionId);
    if (!snapshot) return;
    const runMeta = result ?? snapshot.runs.at(-1);
    if (!runMeta) return;
    const request: TutorRequest = {
      sessionId: snapshot.id,
      code: snapshot.code,
      run: {
        stdout: runMeta.stdout,
        stderr: runMeta.stderr,
        error: runMeta.error,
        status: runMeta.status,
      },
      traceSummary: summarizeTrace(snapshot.latestTrace ?? result?.trace ?? []),
      history: snapshot.chat,
      requestedRung: rung,
      lang: snapshot.lang,
    };
    const response = await askTutor(request);
    if (!response) return;
    appendChat(originatingSessionId, { role: "tutor", content: response, rung });
    const after = sessionById(originatingSessionId);
    if (!after) return;
    if (after.tags.length === 0) {
      const tag = await tagSession({ sessionId: after.id, code: after.code, history: after.chat });
      if (tag) addTag(originatingSessionId, tag);
    }
  }, [addTag, appendChat, askTutor, setRung]);

  const handleRun = useCallback(async () => {
    const active = currentSession();
    if (!active?.code.trim() || phase === "loading" || phase === "running") return;
    setOutputTab("output");
    const result = await run(active.code);
    if (!result) return;
    recordRun(result);
    await talkToTutor(result, 1);
  }, [phase, recordRun, run, talkToTutor]);

  const chooseSample = useCallback((sample: DemoSample) => {
    loadSample(sample);
    closeSamples();
    setOutputTab("output");
    setTraceLine(null);
  }, [closeSamples, loadSample]);

  const handleStudent = useCallback(async (content: string) => {
    const rung = (currentSession().currentRung || 1) as HintRung;
    await talkToTutor(null, rung, content);
  }, [talkToTutor]);

  const handleHint = useCallback(async () => {
    const current = currentSession().currentRung;
    const rung = Math.min(4, Math.max(1, current + 1)) as HintRung;
    await talkToTutor(null, rung, "I'm still stuck. Can I have one more hint?");
  }, [talkToTutor]);

  const shortcutActions = useMemo(() => ({
    onRun: handleRun,
    onSamples: () => openSamples(document.querySelector<HTMLElement>("[data-samples-trigger]")),
    onChat: () => document.getElementById("chat-composer")?.focus(),
  }), [handleRun, openSamples]);
  useEditorShortcuts(shortcutActions);

  const latestRun = session?.runs.at(-1);
  const busy = phase === "loading" || phase === "running";
  const status = phase === "loading"
    ? { label: "Booting Python…", tone: "idle" as const }
    : phase === "running"
      ? { label: "Running…", tone: "idle" as const }
      : phase === "fatal"
        ? { label: "Runtime unavailable", tone: "error" as const }
        : latestRun?.status === "ok"
          ? { label: "Runs clean", tone: "success" as const }
          : latestRun
            ? { label: latestRun.status === "timeout" ? "Timed out (5s limit)" : "Needs inspection", tone: "error" as const }
            : { label: "Ready", tone: "idle" as const };

  return (
    <div className="app-shell" data-hydrated={hydrated}>
      <header className="topbar">
        <button className="brand ghost-button" onClick={() => createSession()} aria-label="Socratic Code Tutor home">
          <span className="brand-mark">⌗</span><span className="brand-word">Socratic</span>
        </button>
        <nav className="top-actions" aria-label="Workspace navigation">
          <button className="button" data-samples-trigger onClick={(event) => openSamples(event.currentTarget)}>Samples <span aria-hidden="true">⌘K</span></button>
          {session?.code ? <select className="button session-select" aria-label="Switch session" value={activeId} onChange={(event) => activate(event.target.value)}>{sessions.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select> : null}
          <button className="button ghost" onClick={() => createSession()}>New session</button>
          <Link className="button ghost" href="/teacher">Teacher view →</Link>
        </nav>
      </header>

      {!session?.code ? <DemoLanding onChoose={chooseSample} /> : (
        <main id="main-content" className="workbench">
          <div className="left-stack">
            <EditorPane code={session.code} onChange={updateCode} onRun={handleRun} disabled={busy} status={status} currentLine={traceLine} />
            <aside className="terminal-panel" aria-label="Execution output and trace">
              <div className="panel-tabs" role="tablist" aria-label="Run details">
                <button className="tab" role="tab" aria-selected={outputTab === "output"} onClick={() => setOutputTab("output")}>Output {latestRun ? "●" : ""}</button>
                <button className="tab" role="tab" aria-selected={outputTab === "trace"} onClick={() => setOutputTab("trace")}>Trace {session.latestTrace?.length ? `(${session.latestTrace.length})` : ""}</button>
                <span className="panel-spacer" />
                <button className="tab reset-tab" onClick={() => { retry(); resetAll(); }}>Reset demo</button>
              </div>
              <div className="output-body" role="tabpanel">
                {outputTab === "trace" ? <TraceVisualizer events={session.latestTrace ?? []} code={session.code} onLineChange={setTraceLine} /> : phase === "loading" ? (
                  <div className="loading-rail"><h3>Booting a real Python interpreter in your browser…</h3><div className="loading-step done"><span className="step-dot" /><span>Fetching runtime</span></div><div className="loading-step active"><span className="step-dot" /><span>Loading standard library</span></div><div className="loading-step"><span className="step-dot" /><span>Ready to trace</span></div><p className="mono-label">One-time cost — cached after this.</p></div>
                ) : phase === "fatal" ? (
                  <div className="fatal-state"><p>{fatal}</p><button className="button terminal-button" onClick={retry}>Retry Python load</button></div>
                ) : !latestRun ? (
                  <div className="empty-terminal">Nothing&apos;s run yet. Press Run (⌘/Ctrl+Enter) to see what happens.</div>
                ) : latestRun.status === "timeout" ? (
                  <div className="traceback"><strong>Timed out</strong><p>This run hit the 5-second limit — check for a loop that never ends.</p></div>
                ) : (
                  <div>
                    {latestRun.error ? <div className="traceback"><strong>{latestRun.error.excType}</strong><p>{latestRun.error.message}</p><span className="mono-label">line {latestRun.error.line ?? "unknown"}</span></div> : <p className="run-success">✓ Python reached the end of the program. Does the output match your expectation?</p>}
                    <pre className="output-pre">{latestRun.stdout || latestRun.stderr || "(no output)"}</pre>
                  </div>
                )}
              </div>
            </aside>
          </div>
          <TutorPanel session={session} streamingText={streamingText} isStreaming={isStreaming} error={error} onSubmit={handleStudent} onHint={handleHint} />
        </main>
      )}

      {samplesOpen ? <div className="drawer-backdrop" role="presentation" onMouseDown={closeSamples}><section ref={setSamplesDialog} tabIndex={-1} className="drawer" role="dialog" aria-modal="true" aria-label="Sample library" onMouseDown={(event) => event.stopPropagation()}><div className="drawer-head"><div><p className="kicker">Sample library</p><h2>Choose the next mystery</h2></div><button className="button ghost" onClick={closeSamples} aria-label="Close sample library">Close ✕</button></div><div className="sample-list">{SAMPLES.map((sample, index) => <button className="sample-card" key={sample.id} onClick={() => chooseSample(sample)}><span className="sample-number">0{index + 1}</span><span><span className="kicker">{sample.eyebrow}</span><h3>{sample.title}</h3><p>{sample.discoveryGoal}</p></span><span className="sample-arrow">→</span></button>)}</div></section></div> : null}
    </div>
  );
}
