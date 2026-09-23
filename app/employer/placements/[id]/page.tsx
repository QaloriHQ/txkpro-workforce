import Link from "next/link";
import { notFound } from "next/navigation";
import { Brand } from "@/components/brand";
import { EmployerWorkspaceNav } from "@/components/employer/workspace-nav";
import { PlacementStatusActions } from "@/components/employer/placement-status-actions";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireEmployerContext } from "@/lib/employer/auth";
import { getEmployerPlacement } from "@/lib/employer/hiring-repository";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export default async function PlacementDetailPage({ params }: RouteContext) {
  const { id } = await params;
  const context = await requireEmployerContext({ approved: true });

  let placement;
  try {
    placement = await getEmployerPlacement(context, decodeURIComponent(id));
  } catch {
    notFound();
  }

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
            <p className="eyebrow">Placement Detail</p>
            <h1>{placement.studentName}</h1>
            <p className="card-sub">{placement.roleTitle} · {placement.tradeId ?? "Trade"}</p>
          </div>
          <span className={`pill ${placement.status === "active" ? "pill-good" : "pill-info"}`}>
            {placement.status.replaceAll("_", " ")}
          </span>
        </div>

        <div className="callout" style={{ marginBottom: 18 }}>
          <strong>Placement is the employment source of truth.</strong>
          The linked Interview and Referral keep their historical records. Retention milestones are separate records rather than Placement statuses.
        </div>

        <div className="grid grid-2">
          <section className="card">
            <h2>Employment outcome</h2>
            <div className="readiness-list" style={{ marginTop: 16 }}>
              <div className="readiness-row"><span>Placement ID</span><strong>{placement.placementId}</strong></div>
              <div className="readiness-row"><span>Start date</span><strong>{placement.hireDate}</strong></div>
              <div className="readiness-row"><span>Employment type</span><strong>{placement.employmentType ?? "—"}</strong></div>
              <div className="readiness-row"><span>Status</span><strong>{placement.status.replaceAll("_", " ")}</strong></div>
              {placement.startedAt ? <div className="readiness-row"><span>Activated</span><strong>{new Date(placement.startedAt).toLocaleString()}</strong></div> : null}
              {placement.endedAt ? <div className="readiness-row"><span>Ended</span><strong>{new Date(placement.endedAt).toLocaleString()}</strong></div> : null}
              {placement.endReason ? <div className="readiness-row"><span>End reason</span><strong>{placement.endReason}</strong></div> : null}
            </div>
            {context.role !== "employer_read_only" ? (
              <div style={{ marginTop: 18 }}>
                <PlacementStatusActions placementId={placement.placementId} status={placement.status} />
              </div>
            ) : null}
          </section>

          <section className="card">
            <h2>Source workflow</h2>
            <div className="readiness-list" style={{ marginTop: 16 }}>
              <div className="readiness-row">
                <span>Interview</span>
                {placement.interviewRequestId ? (
                  <Link className="button button-ghost button-small" href={`/employer/interviews/${encodeURIComponent(placement.interviewRequestId)}`}>
                    {placement.interviewRequestId}
                  </Link>
                ) : <strong>—</strong>}
              </div>
              <div className="readiness-row">
                <span>Referral</span>
                {placement.referralId ? (
                  <Link className="button button-ghost button-small" href={`/employer/referrals/${encodeURIComponent(placement.referralId)}`}>
                    {placement.referralId}
                  </Link>
                ) : <strong>Direct Interview</strong>}
              </div>
              <div className="readiness-row"><span>Hiring Need</span><strong>{placement.hiringNeedTitle ?? placement.hiringNeedId ?? "—"}</strong></div>
            </div>
          </section>
        </div>

        <section className="card" style={{ marginTop: 18 }}>
          <div className="card-header">
            <div>
              <h2>Day 30 / 60 / 90 retention milestones</h2>
              <p className="card-sub">Exactly three milestone templates are created when a hire is recorded.</p>
            </div>
            <span className={`pill ${placement.milestones.length === 3 ? "pill-good" : "pill-warn"}`}>
              {placement.milestones.length} milestones
            </span>
          </div>
          <div className="grid grid-3">
            {placement.milestones.map((milestone) => (
              <div className="metric-card" key={milestone.milestoneId}>
                <span>Day {milestone.dayNumber}</span>
                <strong style={{ fontSize: 22 }}>{new Date(milestone.scheduledFor).toLocaleDateString()}</strong>
                <small>Status: {milestone.status}</small>
              </div>
            ))}
          </div>
        </section>

        <div className="hero-actions">
          <Link className="button button-ghost" href="/employer/placements">Back to Placements</Link>
          <Link className="button button-ghost" href="/employer/pipeline">Hiring Pipeline</Link>
        </div>
      </main>
    </>
  );
}
