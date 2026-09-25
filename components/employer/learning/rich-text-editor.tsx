"use client";

import DOMPurify from "dompurify";
import {
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  BoldIcon,
  ItalicIcon,
  LinkIcon,
  ListBulletIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useRef, useState } from "react";
import { IconButton } from "@/components/design-system";

export function RichTextEditor({
  initialHtml,
  disabled,
  onAutosave,
}: {
  initialHtml: string;
  disabled?: boolean;
  onAutosave: (html: string, text: string) => Promise<void>;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<"saved" | "saving" | "dirty" | "error">("saved");

  useEffect(() => {
    if (!editorRef.current) return;
    editorRef.current.innerHTML = DOMPurify.sanitize(initialHtml || "<p></p>");
  }, [initialHtml]);

  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (status === "dirty" || status === "saving") {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [status]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  function command(name: string, value?: string) {
    if (disabled) return;
    editorRef.current?.focus();
    document.execCommand(name, false, value);
    scheduleSave();
  }

  function scheduleSave() {
    if (disabled || !editorRef.current) return;
    setStatus("dirty");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      if (!editorRef.current) return;
      setStatus("saving");
      const html = DOMPurify.sanitize(editorRef.current.innerHTML);
      const text = editorRef.current.innerText.trim();
      try {
        await onAutosave(html, text);
        setStatus("saved");
      } catch {
        setStatus("error");
      }
    }, 850);
  }

  function addLink() {
    const url = window.prompt("Link URL");
    if (url) command("createLink", url);
  }

  return (
    <div className="txk-rich-editor">
      <div className="txk-rich-toolbar" role="toolbar" aria-label="Rich text formatting">
        <IconButton label="Bold" disabled={disabled} onClick={() => command("bold")}>
          <BoldIcon aria-hidden="true" />
        </IconButton>
        <IconButton label="Italic" disabled={disabled} onClick={() => command("italic")}>
          <ItalicIcon aria-hidden="true" />
        </IconButton>
        <IconButton
          label="Bulleted list"
          disabled={disabled}
          onClick={() => command("insertUnorderedList")}
        >
          <ListBulletIcon aria-hidden="true" />
        </IconButton>
        <IconButton label="Add link" disabled={disabled} onClick={addLink}>
          <LinkIcon aria-hidden="true" />
        </IconButton>
        <IconButton label="Undo" disabled={disabled} onClick={() => command("undo")}>
          <ArrowUturnLeftIcon aria-hidden="true" />
        </IconButton>
        <IconButton label="Redo" disabled={disabled} onClick={() => command("redo")}>
          <ArrowUturnRightIcon aria-hidden="true" />
        </IconButton>
        <span className={`txk-save-state is-${status}`} aria-live="polite">
          {status === "saving"
            ? "Saving…"
            : status === "dirty"
              ? "Unsaved changes"
              : status === "error"
                ? "Save failed"
                : "Saved"}
        </span>
      </div>
      <div
        ref={editorRef}
        className="txk-rich-canvas"
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={scheduleSave}
        aria-label="Rich text content"
      />
    </div>
  );
}
