export function Metric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

export function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" | "warn" | "info" }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

export function Check({ value }: { value: boolean | null }) {
  if (value === true) return <span className="check good">✓</span>;
  if (value === false) return <span className="check bad">×</span>;
  return <span className="check unknown">—</span>;
}
