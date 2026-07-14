"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function useModalDialog(open: boolean, onClose: () => void) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const setDialogElement = useCallback((element: HTMLElement | null) => {
    dialogRef.current = element;
  }, []);

  const rememberTrigger = useCallback((trigger?: HTMLElement | null) => {
    triggerRef.current = trigger ?? (document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null);
  }, []);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!triggerRef.current && document.activeElement instanceof HTMLElement) {
      triggerRef.current = document.activeElement;
    }
    const frame = requestAnimationFrame(() => {
      (dialog.querySelector<HTMLElement>(FOCUSABLE) ?? dialog).focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1) ?? first;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      triggerRef.current?.focus();
    };
  }, [onClose, open]);

  return useMemo(
    () => ({ setDialogElement, rememberTrigger }),
    [rememberTrigger, setDialogElement],
  );
}
