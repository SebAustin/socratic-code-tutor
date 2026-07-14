import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "./types";
import { useSessionStore } from "./store";

const askTutor = vi.hoisted(() => vi.fn());
const tagSession = vi.hoisted(() => vi.fn());

vi.mock("@/features/tutor/useTutorStream", () => ({
  useTutorStream: () => ({
    askTutor,
    cancel: vi.fn(),
    isStreaming: false,
    streamingText: "",
    error: null,
  }),
  tagSession,
}));
vi.mock("@/features/sandbox/useSandbox", () => ({
  useSandbox: () => ({ run: vi.fn(), retry: vi.fn(), phase: "idle", fatal: null }),
}));
vi.mock("@/features/editor/useEditor", () => ({ useEditorShortcuts: vi.fn() }));
vi.mock("@/features/editor/EditorPane", () => ({ EditorPane: () => null }));
vi.mock("@/features/trace/TraceVisualizer", () => ({ TraceVisualizer: () => null }));
vi.mock("@/features/tutor/TutorPanel", () => ({
  TutorPanel: ({ onSubmit }: { onSubmit: (content: string) => Promise<void> }) => (
    <button onClick={() => void onSubmit("Why?")}>Ask tutor</button>
  ),
}));

import { Workbench } from "./Workbench";

function session(id: string): Session {
  return {
    id,
    createdAt: 1,
    title: id,
    lang: "python",
    code: "print(1)",
    runs: [{ id: `${id}-run`, status: "ok", stdout: "1", stderr: "", error: null, durationMs: 1 }],
    latestTrace: [],
    chat: [],
    tags: [],
    currentRung: 1,
  };
}

describe("Workbench tutor session ownership", () => {
  beforeEach(() => {
    askTutor.mockReset();
    tagSession.mockReset().mockResolvedValue(null);
    useSessionStore.setState({
      sessions: [session("origin"), session("other")],
      activeSessionId: "origin",
      hydrated: true,
    });
  });

  it("keeps a delayed tutor reply on the originating session", async () => {
    let resolveTutor: (value: string) => void = () => {};
    askTutor.mockReturnValue(new Promise<string>((resolve) => { resolveTutor = resolve; }));
    tagSession.mockResolvedValue({
      category: "off_by_one", confidence: 0.9, evidenceTurn: 1,
    });
    render(<Workbench />);

    fireEvent.click(screen.getByRole("button", { name: "Ask tutor" }));
    await waitFor(() => expect(askTutor).toHaveBeenCalledOnce());
    act(() => useSessionStore.getState().activate("other"));
    await act(async () => resolveTutor("Reply for origin"));

    await waitFor(() => {
      const state = useSessionStore.getState();
      expect(state.sessions.find(({ id }) => id === "origin")?.chat.at(-1)?.content).toBe("Reply for origin");
      expect(state.sessions.find(({ id }) => id === "origin")?.tags).toHaveLength(1);
      expect(state.sessions.find(({ id }) => id === "other")?.chat).toEqual([]);
      expect(state.sessions.find(({ id }) => id === "other")?.tags).toEqual([]);
    });
  });
});
