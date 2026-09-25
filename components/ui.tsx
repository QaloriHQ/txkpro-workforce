import type { ReactNode } from "react";
import {
  MetricCard,
  StateIcon,
  StatusBadge,
} from "@/components/design-system";

export function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail?: string;
}) {
  return <MetricCard label={label} value={value} detail={detail} />;
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "info";
}) {
  const mapped =
    tone === "good"
      ? "success"
      : tone === "warn"
        ? "warning"
        : tone;
  return <StatusBadge tone={mapped}>{children}</StatusBadge>;
}

export function Check({ value }: { value: boolean | null }) {
  if (value === true) return <StateIcon state="success" label="Yes" />;
  if (value === false) return <StateIcon state="danger" label="No" />;
  return <StateIcon state="neutral" label="Not provided" />;
}
