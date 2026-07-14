"use client";

import { useCallback, useRef, useState } from "react";
import { MAX_STEPS, WALL_MS } from "@/lib/constants";
import type { RunRequest, RunResult } from "@/features/session/types";
import { PyodideRunner } from "./pyodideRunner";

export type SandboxPhase = "idle" | "loading" | "running" | "fatal";

export function useSandbox() {
  const runnerRef = useRef<PyodideRunner | null>(null);
  const [phase, setPhase] = useState<SandboxPhase>("idle");
  const [fatal, setFatal] = useState<string | null>(null);

  const run = useCallback(async (code: string): Promise<RunResult | null> => {
    const runner = runnerRef.current ?? new PyodideRunner();
    runnerRef.current = runner;
    setFatal(null);
    setPhase(runner.isReady ? "running" : "loading");
    const request: RunRequest = {
      type: "run",
      id: crypto.randomUUID(),
      code,
      lang: "python",
      limits: { wallMs: WALL_MS, maxSteps: MAX_STEPS },
    };
    try {
      const result = await runner.run(request);
      setPhase("idle");
      return result;
    } catch {
      setFatal("Python could not start. Check your connection and try again.");
      setPhase("fatal");
      return null;
    }
  }, []);

  const retry = useCallback(() => {
    runnerRef.current?.reset();
    runnerRef.current = null;
    setFatal(null);
    setPhase("idle");
  }, []);

  return { run, retry, phase, fatal };
}
