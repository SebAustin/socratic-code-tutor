"use client";

import { useCallback, useRef, useState } from "react";
import type {
  MisconceptionRecord,
  TutorRequest,
} from "@/features/session/types";
import { parseSseBlock } from "@/lib/sse";

export function useTutorStream() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const activeAbort = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    activeAbort.current?.abort("tutor-request-canceled");
    activeAbort.current = null;
  }, []);

  const askTutor = useCallback(async (request: TutorRequest): Promise<string | null> => {
    cancel();
    const abortController = new AbortController();
    activeAbort.current = abortController;
    setIsStreaming(true);
    setStreamingText("");
    setError(null);
    let assembled = "";
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    try {
      const response = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: abortController.signal,
      });
      if (!response.ok || !response.body) throw new Error("Tutor request failed");

      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";
        for (const block of blocks) {
          const event = parseSseBlock(block);
          if (!event) continue;
          if ("chunk" in event) {
            assembled += event.chunk;
            setStreamingText(assembled);
          }
          if ("error" in event) throw new Error(event.error);
        }
        if (done) break;
      }
      return assembled.trim() || null;
    } catch {
      if (!abortController.signal.aborted) setError("Couldn't reach the tutor. Try again.");
      return null;
    } finally {
      await reader?.cancel().catch(() => undefined);
      if (activeAbort.current === abortController) {
        activeAbort.current = null;
        setIsStreaming(false);
      }
    }
  }, [cancel]);

  return { askTutor, cancel, isStreaming, streamingText, error, clearError: () => setError(null) };
}

export async function tagSession(input: {
  sessionId: string;
  code: string;
  history: TutorRequest["history"];
}): Promise<MisconceptionRecord | null> {
  try {
    const response = await fetch("/api/tag", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return response.ok ? ((await response.json()) as MisconceptionRecord) : null;
  } catch {
    return null;
  }
}
