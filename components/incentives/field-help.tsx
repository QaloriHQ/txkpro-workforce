"use client";
import {
  cloneElement,
  useId,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { InformationCircleIcon } from "@heroicons/react/24/outline";
export function FieldHelp({
  label,
  help,
  id,
}: {
  label: string;
  help: string;
  id?: string;
}) {
  const generated = useId();
  const tooltipId = id ?? generated;
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<React.CSSProperties>({});
  function show() {
    const rect = trigger.current?.getBoundingClientRect();
    if (rect) {
      const width = Math.min(300, window.innerWidth - 24);
      setPosition({
        position: "fixed",
        width,
        left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
        ...(rect.top > window.innerHeight / 2
          ? { bottom: window.innerHeight - rect.top + 6, top: "auto" }
          : { top: rect.bottom + 6, bottom: "auto" }),
      });
    }
    setOpen(true);
  }
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !trigger.current?.parentElement?.contains(event.target)
      )
        close();
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);
  return (
    <span
      className="incentive-help"
      onMouseEnter={show}
      onMouseLeave={(e) => {
        if (!e.currentTarget.contains(document.activeElement)) setOpen(false);
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="incentive-help-trigger"
        aria-label={`Help: ${label}`}
        aria-describedby={tooltipId}
        aria-expanded={open}
        aria-controls={tooltipId}
        onFocus={show}
        onClick={show}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            e.stopPropagation();
          }
        }}
      >
        <InformationCircleIcon width={18} aria-hidden="true" />
      </button>
      <span
        id={tooltipId}
        style={position}
        role="tooltip"
        hidden={!open}
        className="incentive-help-content"
      >
        {help}
      </span>
    </span>
  );
}
export function EditorField({
  label,
  help,
  children,
}: {
  label: string;
  help: string;
  children: ReactElement<{ id?: string; "aria-describedby"?: string }>;
}) {
  const id = useId();
  const helpId = `${id}-help`;
  return (
    <div className="pro-field incentive-field">
      <div className="incentive-field-label">
        <label htmlFor={id}>{label}</label>
        <FieldHelp label={label} help={help} id={helpId} />
      </div>
      {cloneElement(children, {
        id,
        "aria-describedby": [children.props["aria-describedby"], helpId]
          .filter(Boolean)
          .join(" "),
      })}
    </div>
  );
}
export function CheckField({
  label,
  help,
  children,
}: {
  label: ReactNode;
  help: string;
  children: ReactElement<{ id?: string; "aria-describedby"?: string }>;
}) {
  const helpId = useId();
  return (
    <div className="incentive-check-field">
      <label className="pro-check">
        {cloneElement(children, {
          "aria-describedby": [children.props["aria-describedby"], helpId]
            .filter(Boolean)
            .join(" "),
        })}
        {label}
      </label>
      <FieldHelp
        id={helpId}
        label={typeof label === "string" ? label : "this option"}
        help={help}
      />
    </div>
  );
}
