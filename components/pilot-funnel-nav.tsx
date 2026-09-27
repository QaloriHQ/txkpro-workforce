import Link from "next/link";

const steps = [
  { key: "institution", label: "Institution", href: "/institutions" },
  { key: "pilot", label: "Pilot overview", href: "/institutions/pilot" },
  { key: "timeline", label: "Timeline", href: "/institutions/pilot/timeline" },
  { key: "request", label: "Request pilot", href: "/institutions/request-pilot" },
] as const;

export function PilotFunnelNav({
  current,
}: {
  current: (typeof steps)[number]["key"];
}) {
  return (
    <nav className="pilot-funnel-nav" aria-label="Institution pilot steps">
      {steps.map((step, index) => (
        <Link
          key={step.key}
          href={step.href}
          aria-current={current === step.key ? "page" : undefined}
          className={current === step.key ? "active" : undefined}
        >
          <span>{String(index + 1).padStart(2, "0")}</span>
          {step.label}
        </Link>
      ))}
    </nav>
  );
}
