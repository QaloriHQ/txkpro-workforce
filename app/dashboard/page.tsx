import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { getAccountContext } from "@/lib/auth";
import { hasSupabaseServerConfig } from "@/lib/supabase/server";

export default async function DashboardPage() {
  if (!hasSupabaseServerConfig()) redirect("/login");
  const account = await getAccountContext();
  if (!account) redirect("/login");
  if (!account.onboarding || account.onboarding.status === "not_started" || account.onboarding.status === "in_progress") redirect("/onboarding");
  if (account.onboarding.status === "pending_review") redirect("/onboarding?pending=1");
  if (!account.role) redirect("/onboarding");

  const workspace = {
    student: { title: "Student workspace", copy: "Your authenticated student account is connected to the TXKPRO workforce backend.", demo: "/demo/student" },
    educator: { title: "Educator workspace", copy: "Your approved educator membership controls access to institution-scoped student records.", demo: "/demo/educator" },
    employer: { title: "Employer workspace", copy: "Your employer account is connected to your contractor workforce profile and approval state.", demo: "/demo/employer" },
    admin: { title: "TXKPRO operations", copy: "Your internal role membership controls platform-level access. Onboarding never creates administrator privileges.", demo: "/demo/admin" },
  }[account.role];

  return (
    <>
      <header className="topbar">
        <Brand />
        <div className="header-actions">
          <ThemeToggle />
          <form action="/auth/signout" method="post"><button className="button button-dark button-small" type="submit">Sign out</button></form>
        </div>
      </header>
      <main className="page-wrap">
        <div className="page-heading"><div><p className="eyebrow">Authenticated workspace</p><h1>{workspace.title}</h1></div><span className="pill pill-good">Onboarding complete</span></div>
        <div className="dashboard-grid">
          <section className="card"><div className="card-header"><div><h2>Welcome, {account.firstName || "TXKPRO member"}</h2><p className="card-sub">{workspace.copy}</p></div></div><div className="callout"><strong>Backend identity linked</strong>Your Supabase Auth identity is linked to TXKPRO user <code>{account.legacyUserId}</code>. Authorization is derived from active server-side role memberships.</div><div className="hero-actions"><Link className="button button-brand" href={workspace.demo}>Open current MVE workspace</Link><Link className="button button-ghost" href="/onboarding">Review onboarding</Link></div></section>
          <aside className="card"><h3>Account</h3><div className="readiness-list" style={{ marginTop: 16 }}><div className="readiness-row"><span>Role</span><strong>{account.role}</strong></div><div className="readiness-row"><span>Email</span><strong style={{ fontSize: 12 }}>{account.email ?? "—"}</strong></div><div className="readiness-row"><span>Access memberships</span><strong>{account.memberships.filter((item) => item.status === "active").length}</strong></div></div></aside>
        </div>
      </main>
    </>
  );
}
