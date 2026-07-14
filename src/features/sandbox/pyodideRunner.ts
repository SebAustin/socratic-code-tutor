import {
  LOCALS_REPR_MAXLEN,
  RUN_TIMEOUT_MS,
  WORKER_INIT_TIMEOUT_MS,
} from "@/lib/constants";
import type {
  RunRequest,
  RunResult,
  WorkerFatal,
  WorkerMsg,
} from "@/features/session/types";

type PendingRun = {
  resolve: (result: RunResult) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  request: RunRequest;
  startedAt: number;
};

export class PyodideRunner {
  private worker: Worker | null = null;
  private readyPromise: Promise<void> | null = null;
  private pending = new Map<string, PendingRun>();
  private runInFlight = false;
  isReady = false;

  private createWorker(): Promise<void> {
    this.worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    this.isReady = false;
    this.readyPromise = new Promise((resolve, reject) => {
      const initTimer = setTimeout(() => {
        this.reset();
        reject(new Error("Python runtime took too long to load."));
      }, WORKER_INIT_TIMEOUT_MS);

      const handleMessage = (event: MessageEvent<WorkerMsg>) => {
        const message = event.data;
        if (message.type === "ready") {
          clearTimeout(initTimer);
          this.isReady = true;
          resolve();
          return;
        }
        if (message.type === "fatal") {
          clearTimeout(initTimer);
          this.handleFatal(message);
          reject(new Error(message.message));
          return;
        }
        if (message.type === "result") {
          const run = this.pending.get(message.id);
          if (!run) return;
          clearTimeout(run.timer);
          this.pending.delete(message.id);
          run.resolve(message);
        }
      };

      this.worker?.addEventListener("message", handleMessage);
      this.worker?.addEventListener("error", () => {
        clearTimeout(initTimer);
        const fatal: WorkerFatal = {
          type: "fatal",
          stage: this.isReady ? "run" : "load",
          message: "The browser Python worker stopped unexpectedly.",
        };
        this.handleFatal(fatal);
        reject(new Error(fatal.message));
      });
    });
    return this.readyPromise;
  }

  private handleFatal(fatal: WorkerFatal): void {
    for (const run of this.pending.values()) {
      clearTimeout(run.timer);
      run.reject(new Error(fatal.message));
    }
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
    this.readyPromise = null;
    this.isReady = false;
  }

  async run(request: RunRequest): Promise<RunResult> {
    if (this.runInFlight) throw new Error("A Python run is already in progress.");
    this.runInFlight = true;
    try {
      if (!this.worker || !this.readyPromise) await this.createWorker();
      else await this.readyPromise;

      return await new Promise<RunResult>((resolve, reject) => {
        const startedAt = performance.now();
        const timeoutMs = Math.min(RUN_TIMEOUT_MS, request.limits.wallMs);
        const timer = setTimeout(() => {
          this.pending.delete(request.id);
          this.worker?.terminate();
          this.worker = null;
          this.readyPromise = null;
          this.isReady = false;
          resolve({
            type: "result",
            id: request.id,
            stdout: "",
            stderr: "",
            error: null,
            trace: [],
            status: "timeout",
            durationMs: Math.round(performance.now() - startedAt),
          });
        }, timeoutMs);
        this.pending.set(request.id, { resolve, reject, timer, request, startedAt });
        this.worker?.postMessage(request);
      });
    } finally {
      this.runInFlight = false;
    }
  }

  reset(): void {
    this.worker?.terminate();
    this.worker = null;
    this.readyPromise = null;
    this.isReady = false;
    this.runInFlight = false;
    for (const run of this.pending.values()) {
      clearTimeout(run.timer);
      run.reject(new Error("Python runtime was reset."));
    }
    this.pending.clear();
  }
}

export const runnerDefaults = { localsMaxLength: LOCALS_REPR_MAXLEN };
