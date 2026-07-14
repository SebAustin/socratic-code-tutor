import { beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEY } from "@/lib/constants";
import { loadSession, loadSessions, saveSession, saveSessions } from "./storage";
import type { Session } from "./types";

function fixture(): Session {
  return {
    id: "s1", createdAt: 1, title: "Loop", lang: "python", code: "print(1)", currentRung: 2,
    runs: [{ id: "r1", status: "ok", stdout: "1\n", stderr: "", error: null, durationMs: 12 }],
    latestTrace: [{ step: 0, line: 1, event: "line", depth: 0, func: "<module>", locals: {} }],
    chat: [{ role: "student", content: "Why?" }],
    tags: [{ category: "off_by_one", confidence: 0.9, evidenceTurn: 1 }],
  };
}

describe("session storage", () => {
  beforeEach(() => { window.localStorage.clear(); vi.restoreAllMocks(); });
  it("round-trips a session unchanged", () => {
    saveSession(fixture());
    expect(loadSession("s1")).toEqual(fixture());
  });
  it("drops traces on quota overflow while preserving chat and tags", () => {
    const storagePrototype = Object.getPrototypeOf(window.localStorage) as Storage;
    const original = storagePrototype.setItem;
    const spy = vi.spyOn(storagePrototype, "setItem");
    spy.mockImplementationOnce(() => { throw new DOMException("quota", "QuotaExceededError"); });
    spy.mockImplementation(function (this: Storage, key: string, value: string) { return original.call(this, key, value); });
    expect(() => saveSessions([fixture()])).not.toThrow();
    expect(loadSessions()[0].latestTrace).toBeNull();
    expect(loadSessions()[0].chat).toHaveLength(1);
    expect(loadSessions()[0].tags).toHaveLength(1);
  });
  it("persists only RunMeta fields", () => {
    const session = fixture();
    (session.runs[0] as unknown as Record<string, unknown>).trace = [{ step: 99 }];
    saveSessions([session]);
    const serialized = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]") as Session[];
    expect(serialized[0].runs[0]).not.toHaveProperty("trace");
  });
  it("returns an empty list for malformed data", () => {
    window.localStorage.setItem(STORAGE_KEY, "not-json");
    expect(loadSessions()).toEqual([]);
  });
});
