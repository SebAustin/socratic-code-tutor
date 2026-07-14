import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TutorRequest } from "@/features/session/types";
import { useTutorStream } from "./useTutorStream";

const request: TutorRequest = {
  sessionId: "s1", code: "print(1)", run: { stdout: "1", stderr: "", error: null, status: "ok" },
  traceSummary: "line 1", history: [], requestedRung: 1, lang: "python",
};

describe("useTutorStream", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("skips a malformed SSE block without discarding later valid chunks", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(
          'data: {"chunk":42}\n\ndata: {"chunk":"Keep this reply"}\n\ndata: {"done":true,"rung":1,"flagged":false}\n\n',
        ));
        controller.close();
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 200 })));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { result } = renderHook(() => useTutorStream());

    let reply: string | null = null;
    await act(async () => { reply = await result.current.askTutor(request); });

    expect(reply).toBe("Keep this reply");
    expect(result.current.error).toBeNull();
  });
});
