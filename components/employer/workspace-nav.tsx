import Link from "next/link";

export function EmployerWorkspaceNav({
  active,
}: {
  active?:
    | "overview"
    | "talent"
    | "saved"
    | "referrals"
    | "interviews"
    | "pipeline"
    | "placements";
}) {
  const items = [
    ["overview", "/employer", "Overview"],
    ["talent", "/employer/talent", "Talent"],
    ["saved", "/employer/saved", "Saved"],
    ["referrals", "/employer/referrals", "Referrals"],
    ["interviews", "/employer/interviews", "Interviews"],
    ["pipeline", "/employer/pipeline", "Hiring Pipeline"],
    ["placements", "/employer/placements", "Placements"],
  ] as const;

  return (
    <nav className="topnav" aria-label="Employer workspace">
      {items.map(([key, href, label]) => (
        <Link
          className={`nav-link ${active === key ? "active" : ""}`}
          href={href}
          key={key}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
