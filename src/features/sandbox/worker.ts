/// <reference lib="webworker" />

import {
  LOCALS_REPR_MAXLEN,
  PYODIDE_INDEX_URL,
  PYODIDE_MODULE_URL,
} from "@/lib/constants";
import type { RunRequest, RunResult, WorkerMsg } from "@/features/session/types";

type Pyodide = {
  globals: { set: (key: string, value: unknown) => void; delete: (key: string) => void };
  runPythonAsync: (code: string) => Promise<unknown>;
};

type PyodideModule = {
  loadPyodide: (options: { indexURL: string }) => Promise<Pyodide>;
};

const scope = self as unknown as DedicatedWorkerGlobalScope;

// Single source of truth for the Python tracer executed inside the Pyodide worker.
const TRACE_RUNNER = String.raw`
import io, json, sys, time, traceback

class _SocraticStepLimit(Exception):
    pass

def _safe_repr(value, max_length):
    try:
        rendered = repr(value)
    except Exception:
        rendered = "<unrepresentable>"
    if isinstance(value, (list, dict, set, bytearray)):
        rendered = f"{rendered} <id:{id(value)}>"
    return rendered if len(rendered) <= max_length else rendered[:max_length - 1] + "…"

def _run_student(code, max_steps, locals_max_length):
    events, steps = [], 0
    out, err = io.StringIO(), io.StringIO()
    started = time.perf_counter()
    def trace(frame, event, arg):
        nonlocal steps
        if frame.f_code.co_filename != "<student>" or event not in ("line", "call", "return", "exception"):
            return trace
        steps += 1
        if steps > max_steps:
            raise _SocraticStepLimit("Execution exceeded the trace step limit")
        depth, cursor = 0, frame.f_back
        while cursor is not None:
            if cursor.f_code.co_filename == "<student>": depth += 1
            cursor = cursor.f_back
        events.append({
            "step": len(events), "line": frame.f_lineno, "event": event,
            "depth": depth, "func": frame.f_code.co_name,
            "locals": {k: _safe_repr(v, locals_max_length) for k, v in frame.f_locals.items() if not k.startswith("__")}
        })
        return trace
    error, status = None, "ok"
    old_out, old_err = sys.stdout, sys.stderr
    try:
        sys.stdout, sys.stderr = out, err
        compiled = compile(code, "<student>", "exec")
        sys.settrace(trace)
        namespace = {"__name__": "__main__"}
        exec(compiled, namespace, namespace)
    except _SocraticStepLimit as exc:
        status = "step_limit"
        error = {"excType": type(exc).__name__, "message": str(exc), "line": None}
    except BaseException as exc:
        status = "error"
        line = getattr(exc, "lineno", None)
        if exc.__traceback__ is not None:
            frames = [f for f in traceback.extract_tb(exc.__traceback__) if f.filename == "<student>"]
            if frames: line = frames[-1].lineno
        error = {"excType": type(exc).__name__, "message": str(exc), "line": line}
        traceback.print_exception(type(exc), exc, exc.__traceback__, file=err)
    finally:
        sys.settrace(None)
        sys.stdout, sys.stderr = old_out, old_err
    return {"stdout": out.getvalue(), "stderr": err.getvalue(), "error": error, "trace": events,
            "status": status, "durationMs": round((time.perf_counter() - started) * 1000)}

json.dumps(_run_student(__SCT_STUDENT_CODE, __SCT_MAX_STEPS, __SCT_LOCALS_MAX_LENGTH))
`;

let pyodide: Pyodide;

async function initialize(): Promise<void> {
  try {
    const pyodideModule = (await import(/* webpackIgnore: true */ PYODIDE_MODULE_URL)) as PyodideModule;
    pyodide = await pyodideModule.loadPyodide({ indexURL: PYODIDE_INDEX_URL });
    scope.postMessage({ type: "ready" } satisfies WorkerMsg);
  } catch {
    scope.postMessage({
      type: "fatal",
      stage: "load",
      message: "Python could not load from the CDN. Check your connection and retry.",
    } satisfies WorkerMsg);
  }
}

const ready = initialize();

scope.onmessage = async (event: MessageEvent<RunRequest>) => {
  const request = event.data;
  if (request.type !== "run") return;
  scope.postMessage({ type: "progress", id: request.id } satisfies WorkerMsg);
  try {
    await ready;
    pyodide.globals.set("__SCT_STUDENT_CODE", request.code);
    pyodide.globals.set("__SCT_MAX_STEPS", request.limits.maxSteps);
    pyodide.globals.set("__SCT_LOCALS_MAX_LENGTH", LOCALS_REPR_MAXLEN);
    const json = await pyodide.runPythonAsync(TRACE_RUNNER);
    const result = JSON.parse(String(json)) as Omit<RunResult, "type" | "id">;
    scope.postMessage({ type: "result", id: request.id, ...result } satisfies RunResult);
  } catch {
    scope.postMessage({
      type: "fatal",
      id: request.id,
      stage: "run",
      message: "The Python runtime stopped while running this program.",
    } satisfies WorkerMsg);
  } finally {
    pyodide?.globals.delete("__SCT_STUDENT_CODE");
    pyodide?.globals.delete("__SCT_MAX_STEPS");
    pyodide?.globals.delete("__SCT_LOCALS_MAX_LENGTH");
  }
};

export {};
