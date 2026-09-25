import Link from "next/link";
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  MinusCircleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function Button({
  tone = "default",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "default" | "primary" | "danger" | "ghost";
  size?: "sm" | "md";
}) {
  return (
    <button
      className={classes(
        "txk-button",
        `txk-button-${tone}`,
        `txk-button-${size}`,
        className,
      )}
      {...props}
    />
  );
}

export function ButtonLink({
  href,
  children,
  tone = "default",
  size = "md",
  className,
}: {
  href: string;
  children: ReactNode;
  tone?: "default" | "primary" | "danger" | "ghost";
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={classes(
        "txk-button",
        `txk-button-${tone}`,
        `txk-button-${size}`,
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function IconButton({
  label,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={classes("txk-icon-button", className)}
      {...props}
    >
      {children}
    </button>
  );
}

export function Card({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={classes("txk-card", className)} {...props} />;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="txk-page-header">
      <div>
        {eyebrow ? <p className="txk-eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <div className="txk-page-description">{description}</div> : null}
      </div>
      {actions ? <div className="txk-page-actions">{actions}</div> : null}
    </header>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  href,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  href?: string;
}) {
  const content = (
    <>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </>
  );

  return href ? (
    <Link className="txk-metric-card" href={href}>
      {content}
    </Link>
  ) : (
    <div className="txk-metric-card">{content}</div>
  );
}

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}) {
  return <span className={`txk-status-badge txk-status-${tone}`}>{children}</span>;
}

export function StateIcon({
  state,
  label,
}: {
  state: "success" | "danger" | "warning" | "info" | "neutral";
  label: string;
}) {
  const Icon =
    state === "success"
      ? CheckCircleIcon
      : state === "danger"
        ? XCircleIcon
        : state === "warning"
          ? ExclamationTriangleIcon
          : state === "info"
            ? InformationCircleIcon
            : MinusCircleIcon;

  return (
    <span className={`txk-state-icon txk-state-${state}`} aria-label={label} title={label}>
      <Icon aria-hidden="true" />
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="txk-empty-state">
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
      {action ? <div className="txk-empty-action">{action}</div> : null}
    </div>
  );
}

export function FormField({
  label,
  help,
  error,
  children,
}: {
  label: string;
  help?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="txk-form-field">
      <span className="txk-form-label">{label}</span>
      {children}
      {error ? (
        <span className="txk-form-error">{error}</span>
      ) : help ? (
        <span className="txk-form-help">{help}</span>
      ) : null}
    </label>
  );
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={classes("txk-input", className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={classes("txk-textarea", className)} {...props} />;
}

export function DataTable({
  children,
  label,
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <div className="txk-table-wrap">
      <table aria-label={label}>{children}</table>
    </div>
  );
}

export function RoleViewBanner({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <aside className="txk-role-banner">
      <InformationCircleIcon aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </aside>
  );
}
