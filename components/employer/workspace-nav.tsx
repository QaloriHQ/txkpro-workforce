import Link from "next/link";

export function EmployerWorkspaceNav({
  active,
}: {
  active?: "overview" | "talent" | "saved" | "referrals";
}) {
  const items = [
    ["overview", "/employer", "Overview"],
    ["talent", "/employer/talent", "Talent"],
    ["saved", "/employer/saved", "Saved Candidates"],
    ["referrals", "/employer/referrals", "Referrals"],
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
