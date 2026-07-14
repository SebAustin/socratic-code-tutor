export type RunRequest = {
  type: "run";
  id: string;
  code: string;
  lang: "python";
  limits: { wallMs: number; maxSteps: number };
};

export type RunResult = {
  type: "result";
  id: string;
  stdout: string;
  stderr: string;
  error: TracebackInfo | null;
  trace: TraceEvent[];
  status: "ok" | "error" | "timeout" | "step_limit";
  durationMs: number;
};

export type WorkerFatal = {
  type: "fatal";
  id?: string;
  stage: "load" | "run";
  message: string;
};

export type WorkerMsg =
  | RunResult
  | WorkerFatal
  | { type: "ready" }
  | { type: "progress"; id: string };

export interface TracebackInfo {
  excType: string;
  message: string;
  line: number | null;
}

export interface TraceEvent {
  step: number;
  line: number;
  event: "line" | "call" | "return" | "exception";
  depth: number;
  func: string;
  locals: Record<string, string>;
}

export interface TutorRequest {
  sessionId: string;
  code: string;
  run: {
    stdout: string;
    stderr: string;
    error: TracebackInfo | null;
    status: string;
  };
  traceSummary: string;
  history: TutorHistoryTurn[];
  requestedRung: 1 | 2 | 3 | 4;
  lang: "python" | "javascript";
}

export type TutorHistoryTurn = Omit<ChatTurn, "id"> & { id?: string };

export interface ChatTurn {
  id: string;
  role: "student" | "tutor";
  content: string;
  rung?: number;
}

export interface MisconceptionRecord {
  category:
    | "off_by_one"
    | "mutation_vs_copy"
    | "scope_confusion"
    | "type_coercion"
    | "operator_precedence"
    | "loop_condition"
    | "mutable_default_arg"
    | "other";
  freeText?: string;
  confidence: number;
  evidenceTurn: number;
}

export interface RunMeta {
  id: string;
  status: RunResult["status"];
  stdout: string;
  stderr: string;
  error: TracebackInfo | null;
  durationMs: number;
}

export interface Session {
  id: string;
  createdAt: number;
  title: string;
  lang: "python" | "javascript";
  code: string;
  runs: RunMeta[];
  latestTrace: TraceEvent[] | null;
  chat: ChatTurn[];
  tags: MisconceptionRecord[];
  currentRung: 0 | 1 | 2 | 3 | 4;
}

export type TutorSseEvent =
  | { chunk: string }
  | { done: true; rung: number; flagged: boolean }
  | { error: string };
