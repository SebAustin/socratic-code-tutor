import { PERSISTED_TRACE_MAX_EVENTS, STORAGE_KEY } from "@/lib/constants";
import { capTrace } from "@/features/tutor/traceSummary";
import type { Session } from "./types";

function compactSession(session: Session, dropTrace = false): Session {
  return {
    ...session,
    runs: session.runs.map(({ id, status, stdout, stderr, error, durationMs }) => ({
      id,
      status,
      stdout,
      stderr,
      error,
      durationMs,
    })),
    latestTrace: dropTrace
      ? null
      : session.latestTrace
        ? capTrace(session.latestTrace, PERSISTED_TRACE_MAX_EVENTS)
        : null,
  };
}

function browserStorage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

function isQuotaError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "QuotaExceededError";
}

function sessionsWithoutOldChat(sessions: Session[]): Session[] {
  const newest = new Set(
    [...sessions]
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, 5)
      .map(({ id }) => id),
  );
  return sessions.map((session) => ({
    ...compactSession(session, true),
    chat: newest.has(session.id) ? session.chat : [],
  }));
}

function persist(storage: Storage, sessions: Session[]): boolean {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    return true;
  } catch {
    return false;
  }
}

export function saveSessions(sessions: Session[]): void {
  const storage = browserStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(sessions.map((s) => compactSession(s))));
  } catch (error) {
    if (isQuotaError(error) && persist(storage, sessions.map((session) => compactSession(session, true)))) return;
    if (isQuotaError(error) && persist(storage, sessionsWithoutOldChat(sessions))) return;
    console.warn("[session-storage] persistence skipped after storage failures");
  }
}

export function loadSessions(): Session[] {
  const storage = browserStorage();
  if (!storage) return [];
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const sessions = JSON.parse(raw) as Session[];
    return Array.isArray(sessions) ? sessions.map((session) => ({
      ...session,
      chat: (session.chat ?? []).map((turn, index) => ({
        ...turn,
        id: turn.id || `${session.id}-chat-${index}`,
      })),
    })) : [];
  } catch {
    return [];
  }
}

export function saveSession(session: Session): void {
  const sessions = loadSessions();
  const next = sessions.some(({ id }) => id === session.id)
    ? sessions.map((item) => (item.id === session.id ? session : item))
    : [session, ...sessions];
  saveSessions(next);
}

export function loadSession(id: string): Session | null {
  return loadSessions().find((session) => session.id === id) ?? null;
}
