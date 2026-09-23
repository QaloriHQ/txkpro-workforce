import Link from "next/link";
import { Brand } from "@/components/brand";
import { EmployerWorkspaceNav } from "@/components/employer/workspace-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireEmployerContext } from "@/lib/employer/auth";
import { listEmployerPlacements } from "@/lib/employer/hiring-repository";

export const dynamic = "force-dynamic";

export default async function EmployerPlacementsPage() {
  const context = await requireEmployerContext({ approved: true });
  const placements = await listEmployerPlacements(context);

  return (
    <>
      <header className="topbar">
        <Brand />
        <EmployerWorkspaceNav active="placements" />
        <ThemeToggle />
        <SignOutButton />
      </header>
      <main className="page-wrap">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Employer · Placements</p>
            <h1>Placement outcomes</h1>
            <p className="card-sub">
              Placement owns the employment outcome. Interview and Referral retain their historical state.
            </p>
          </div>
          <span className="pill pill-good">{placements.length} placements</span>
        </div>

        <div className="grid grid-2">
          {placements.map((placement) => (
            <article className="card" key={placement.placementId}>
              <div className="card-header">
                <div>
                  <h2>{placement.studentName}</h2>
                  <p className="card-sub">{placement.roleTitle} · {placement.tradeId ?? "Trade"}</p>
                </div>
                <span className={`pill ${placement.status === "active" ? "pill-good" : "pill-info"}`}>
                  {placement.status.replaceAll("_", " ")}
                </span>
              </div>
              <div className="readiness-list">
                <div className="readiness-row"><span>Start date</span><strong>{placement.hireDate}</strong></div>
                <div className="readiness-row"><span>Employment type</span><strong>{placement.employmentType ?? "—"}</strong></div>
                <div className="readiness-row"><span>Hiring Need</span><strong>{placement.hiringNeedTitle ?? "—"}</strong></div>
                <div className="readiness-row"><span>Retention milestones</span><strong>{placement.milestoneCount}</strong></div>
              </div>
              <div className="hero-actions">
                <Link className="button button-dark" href={`/employer/placements/${encodeURIComponent(placement.placementId)}`}>
                  Placement Detail
                </Link>
              </div>
            </article>
          ))}
        </div>

        {!placements.length ? (
          <div className="empty card">
            <strong>No Placements recorded.</strong>
            Complete an Interview and record a human hiring decision to create a Placement.
          </div>
        ) : null}
      </main>
    </>
  );
}
