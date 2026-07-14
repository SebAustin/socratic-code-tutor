"use client";

import { create } from "zustand";
import type {
  ChatTurn,
  MisconceptionRecord,
  RunResult,
  Session,
} from "./types";
import type { DemoSample } from "@/features/demo/samples";
import { loadSessions, saveSessions } from "./storage";
import { capTrace } from "@/features/tutor/traceSummary";

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `session-${Date.now()}`;
}

function blankSession(): Session {
  return {
    id: newId(),
    createdAt: Date.now(),
    title: "Untitled Python problem",
    lang: "python",
    code: "",
    runs: [],
    latestTrace: null,
    chat: [],
    tags: [],
    currentRung: 0,
  };
}

type SessionState = {
  sessions: Session[];
  activeSessionId: string;
  hydrated: boolean;
  hydrate: (preferredId?: string | null) => void;
  activate: (id: string) => void;
  createSession: () => string;
  loadSample: (sample: DemoSample) => string;
  updateCode: (code: string) => void;
  recordRun: (result: RunResult) => void;
  appendChat: (turn: ChatTurn) => void;
  setRung: (rung: 0 | 1 | 2 | 3 | 4) => void;
  addTag: (tag: MisconceptionRecord) => void;
  deleteSession: (id: string) => void;
  resetAll: () => void;
};

const initial = blankSession();

function persist(sessions: Session[]): void {
  saveSessions(sessions);
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [initial],
  activeSessionId: initial.id,
  hydrated: false,

  hydrate(preferredId) {
    const saved = loadSessions();
    if (saved.length === 0) {
      set({ hydrated: true });
      return;
    }
    const preferred = saved.some(({ id }) => id === preferredId) ? preferredId : saved[0].id;
    set({ sessions: saved, activeSessionId: preferred ?? saved[0].id, hydrated: true });
  },

  activate(id) {
    if (get().sessions.some((session) => session.id === id)) set({ activeSessionId: id });
  },

  createSession() {
    const session = blankSession();
    const sessions = [session, ...get().sessions];
    persist(sessions);
    set({ sessions, activeSessionId: session.id });
    return session.id;
  },

  loadSample(sample) {
    const session: Session = {
      ...blankSession(),
      title: sample.title,
      code: sample.code,
      chat: [
        {
          role: "tutor",
          content: "Run it when you're ready. We'll compare what you expected with what Python actually did.",
        },
      ],
    };
    const sessions = [session, ...get().sessions.filter(({ code, runs }) => code || runs.length)];
    persist(sessions);
    set({ sessions, activeSessionId: session.id });
    return session.id;
  },

  updateCode(code) {
    const sessions = get().sessions.map((session) =>
      session.id === get().activeSessionId ? { ...session, code } : session,
    );
    persist(sessions);
    set({ sessions });
  },

  recordRun(result) {
    const sessions = get().sessions.map((session) =>
      session.id === get().activeSessionId
        ? {
            ...session,
            runs: [
              ...session.runs,
              {
                id: result.id,
                status: result.status,
                stdout: result.stdout,
                stderr: result.stderr,
                error: result.error,
                durationMs: result.durationMs,
              },
            ],
            latestTrace: capTrace(result.trace),
          }
        : session,
    );
    persist(sessions);
    set({ sessions });
  },

  appendChat(turn) {
    const sessions = get().sessions.map((session) =>
      session.id === get().activeSessionId
        ? { ...session, chat: [...session.chat, turn] }
        : session,
    );
    persist(sessions);
    set({ sessions });
  },

  setRung(rung) {
    const sessions = get().sessions.map((session) =>
      session.id === get().activeSessionId ? { ...session, currentRung: rung } : session,
    );
    persist(sessions);
    set({ sessions });
  },

  addTag(tag) {
    const sessions = get().sessions.map((session) =>
      session.id === get().activeSessionId
        ? { ...session, tags: [...session.tags, tag] }
        : session,
    );
    persist(sessions);
    set({ sessions });
  },

  deleteSession(id) {
    let sessions = get().sessions.filter((session) => session.id !== id);
    if (sessions.length === 0) sessions = [blankSession()];
    persist(sessions);
    set({ sessions, activeSessionId: sessions[0].id });
  },

  resetAll() {
    const session = blankSession();
    persist([session]);
    set({ sessions: [session], activeSessionId: session.id });
  },
}));

export function activeSession(state: SessionState): Session {
  return state.sessions.find(({ id }) => id === state.activeSessionId) ?? state.sessions[0];
}
