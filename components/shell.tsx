import Link from "next/link";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";

export function Shell({
  title,
  eyebrow,
  children,
  active,
}: {
  title: string;
  eyebrow: string;
  children: React.ReactNode;
  active?: string;
}) {
  const items = [
    ["Student", "/demo/student"],
    ["Educator", "/demo/educator"],
    ["Employer", "/demo/employer"],
    ["Admin", "/demo/admin"],
  ];

  return (
    <div className="app-shell">
      <header className="topbar">
        <Brand />
        <nav className="topnav" aria-label="Role previews">
          {items.map(([label, href]) => (
            <Link className={active === label.toLowerCase() ? "nav-link active" : "nav-link"} href={href} key={href}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="header-actions">
          <ThemeToggle />
          <Link className="button button-dark button-small" href="/login">Sign in</Link>
        </div>
      </header>
      <main className="page-wrap">
        <div className="page-heading">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
          </div>
          <span className="demo-badge">Demo data</span>
        </div>
        {children}
      </main>
    </div>
  );
}
