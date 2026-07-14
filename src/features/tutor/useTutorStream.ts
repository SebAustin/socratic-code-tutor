"use client";

import { useCallback, useState } from "react";
import type {
  MisconceptionRecord,
  TutorRequest,
  TutorSseEvent,
} from "@/features/session/types";
import { parseSseBlock } from "@/lib/sse";

export function useTutorStream() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const askTutor = useCallback(async (request: TutorRequest): Promise<string | null> => {
    setIsStreaming(true);
    setStreamingText("");
    setError(null);
    let assembled = "";
    try {
      const response = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!response.ok || !response.body) throw new Error("Tutor request failed");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";
        for (const block of blocks) {
          const event = parseSseBlock(block) as TutorSseEvent | null;
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
      setError("Couldn't reach the tutor. Try again.");
      return null;
    } finally {
      setIsStreaming(false);
    }
  }, []);

  return { askTutor, isStreaming, streamingText, error, clearError: () => setError(null) };
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
