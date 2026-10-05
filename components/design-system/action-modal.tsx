"use client";

import { useId, useRef, type ComponentPropsWithRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { XMarkIcon } from "@heroicons/react/24/outline";

export function ActionModal({ title, triggerLabel, triggerContent, description, busy = false, children }: {
  title: string;
  triggerLabel: string;
  triggerContent?: ReactNode;
  description?: string;
  busy?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const isPending = () => busy || Boolean(dialog.current?.querySelector('[data-form-pending="true"]'));

  function close() {
    if (!isPending()) dialog.current?.close();
  }

  return <div className="txk-modal-action">
    <button ref={trigger} className="txk-button txk-button-primary txk-button-md" type="button" aria-label={triggerLabel} aria-haspopup="dialog" aria-controls={id} disabled={busy}
      onClick={() => dialog.current?.showModal()}>{triggerContent ?? triggerLabel}</button>
    <dialog ref={dialog} id={id} className="txk-action-dialog" aria-labelledby={`${id}-title`} aria-describedby={description ? `${id}-description` : undefined}
      onCancel={event => { if (isPending()) event.preventDefault(); }}
      onClose={() => trigger.current?.focus()}>
      <header className="txk-action-dialog-header">
        <div><h2 id={`${id}-title`}>{title}</h2>{description ? <p id={`${id}-description`}>{description}</p> : null}</div>
        <button className="txk-action-dialog-close" type="button" aria-label={`Close ${title}`} onClick={close} disabled={busy}><XMarkIcon aria-hidden="true" /></button>
      </header>
      <div className="txk-action-dialog-body">{children}</div>
      <footer className="txk-action-dialog-footer"><button className="txk-button txk-button-default txk-button-md" type="button" onClick={close} disabled={busy}>Cancel / close</button></footer>
    </dialog>
  </div>;
}

function PendingMarker() {
  const { pending } = useFormStatus();
  return <span hidden data-form-pending={pending ? "true" : "false"} />;
}

// Keep the form mounted while closed, so Cancel/Escape never discard a draft.
// Native dialog supplies top-layer focus containment and background inertness.
export function WorkspaceForm({ modalTitle, triggerLabel = modalTitle, description, busy = false, feedback, children, ...formProps }:
  ComponentPropsWithRef<"form"> & { modalTitle: string; triggerLabel?: string; description?: string; busy?: boolean; feedback?: ReactNode }) {
  return <ActionModal title={modalTitle} triggerLabel={triggerLabel} description={description} busy={busy}>
    <form {...formProps}><PendingMarker />{feedback}{children}</form>
  </ActionModal>;
}
