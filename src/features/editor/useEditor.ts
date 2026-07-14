"use client";

import { useEffect } from "react";

export function useEditorShortcuts(actions: {
  onRun: () => void;
  onSamples: () => void;
  onChat: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key === "Enter") {
        event.preventDefault();
        actions.onRun();
      }
      if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        actions.onSamples();
      }
      if (event.key === "/") {
        event.preventDefault();
        actions.onChat();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [actions]);
}
