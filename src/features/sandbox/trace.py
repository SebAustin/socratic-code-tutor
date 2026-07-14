import io
import json
import sys
import time
import traceback


class _SocraticStepLimit(Exception):
    pass


def _safe_repr(value, max_length):
    try:
        rendered = repr(value)
    except Exception:
        rendered = "<unrepresentable>"
    if len(rendered) > max_length:
        return rendered[: max_length - 1] + "…"
    return rendered


def run_student(code, max_steps, locals_max_length):
    events = []
    stdout_buffer = io.StringIO()
    stderr_buffer = io.StringIO()
    started = time.perf_counter()
    steps = 0

    def trace(frame, event, arg):
        nonlocal steps
        if frame.f_code.co_filename != "<student>":
            return trace
        if event not in ("line", "call", "return", "exception"):
            return trace
        steps += 1
        if steps > max_steps:
            raise _SocraticStepLimit("Execution exceeded the trace step limit")
        depth = 0
        cursor = frame.f_back
        while cursor is not None:
            if cursor.f_code.co_filename == "<student>":
                depth += 1
            cursor = cursor.f_back
        local_values = {
            key: _safe_repr(value, locals_max_length)
            for key, value in frame.f_locals.items()
            if not key.startswith("__")
        }
        events.append(
            {
                "step": len(events),
                "line": frame.f_lineno,
                "event": event,
                "depth": depth,
                "func": frame.f_code.co_name,
                "locals": local_values,
            }
        )
        return trace

    error = None
    status = "ok"
    namespace = {"__name__": "__main__"}
    previous_stdout, previous_stderr = sys.stdout, sys.stderr
    try:
        sys.stdout, sys.stderr = stdout_buffer, stderr_buffer
        compiled = compile(code, "<student>", "exec")
        sys.settrace(trace)
        exec(compiled, namespace, namespace)
    except _SocraticStepLimit as exc:
        status = "step_limit"
        error = {"excType": type(exc).__name__, "message": str(exc), "line": None}
    except BaseException as exc:
        status = "error"
        line = getattr(exc, "lineno", None)
        if exc.__traceback__ is not None:
            student_frames = [
                frame for frame in traceback.extract_tb(exc.__traceback__)
                if frame.filename == "<student>"
            ]
            if student_frames:
                line = student_frames[-1].lineno
        error = {"excType": type(exc).__name__, "message": str(exc), "line": line}
        traceback.print_exception(type(exc), exc, exc.__traceback__, file=stderr_buffer)
    finally:
        sys.settrace(None)
        sys.stdout, sys.stderr = previous_stdout, previous_stderr

    return {
        "stdout": stdout_buffer.getvalue(),
        "stderr": stderr_buffer.getvalue(),
        "error": error,
        "trace": events,
        "status": status,
        "durationMs": round((time.perf_counter() - started) * 1000),
    }


json.dumps(run_student(__SCT_STUDENT_CODE, __SCT_MAX_STEPS, __SCT_LOCALS_MAX_LENGTH))
