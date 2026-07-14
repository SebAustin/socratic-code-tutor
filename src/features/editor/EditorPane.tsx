"use client";

import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";

const PYTHON_EXTENSIONS = [python()];
const BASIC_SETUP = {
  lineNumbers: true,
  foldGutter: false,
  highlightActiveLine: true,
  highlightActiveLineGutter: true,
  autocompletion: false,
};

type EditorPaneProps = {
  code: string;
  onChange: (code: string) => void;
  onRun: () => void;
  disabled: boolean;
  status: { label: string; tone: "idle" | "success" | "error" };
  currentLine: number | null;
};

export function EditorPane({
  code,
  onChange,
  onRun,
  disabled,
  status,
  currentLine,
}: EditorPaneProps) {
  return (
    <section className="terminal-panel" aria-label="Code editor">
      <div className="editor-toolbar">
        <div className="toolbar-cluster">
          <span className="mono-label">Python 3</span>
          {currentLine ? <span className="mono-label">trace · line {currentLine}</span> : null}
        </div>
        <div className="toolbar-cluster">
          <span className={`status-pill ${status.tone}`} role="status" aria-live="polite">
            <span className="status-dot" aria-hidden="true" />
            {status.label}
          </span>
          <button className="button primary" type="button" onClick={onRun} disabled={disabled}>
            <span aria-hidden="true">▶</span> {disabled ? "Running…" : "Run"}
            <span aria-hidden="true">⌘↵</span>
          </button>
        </div>
      </div>
      <div className="editor-frame">
        <CodeMirror
          value={code}
          height="330px"
          theme="dark"
          extensions={PYTHON_EXTENSIONS}
          onChange={onChange}
          aria-label="Python code editor"
          basicSetup={BASIC_SETUP}
        />
      </div>
    </section>
  );
}
