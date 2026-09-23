import Link from "next/link";
import { Brand } from "@/components/brand";
import { EmployerWorkspaceNav } from "@/components/employer/workspace-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireEmployerContext } from "@/lib/employer/auth";
import { listEmployerInterviews } from "@/lib/employer/hiring-repository";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function EmployerInterviewsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const context = await requireEmployerContext({ approved: true });
  const params = await searchParams;
  const queue = one(params.queue) ?? "all";
  const interviews = await listEmployerInterviews(context, queue);

  const queues = [
    ["all", "All"],
    ["needs_response", "Needs Response"],
    ["scheduling", "Scheduling"],
    ["scheduled", "Scheduled"],
    ["decision", "Decision"],
    ["closed", "Closed"],
  ] as const;

  return (
    <>
      <header className="topbar">
        <Brand />
        <EmployerWorkspaceNav active="interviews" />
        <ThemeToggle />
        <SignOutButton />
      </header>
      <main className="page-wrap">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Employer · Interviews</p>
            <h1>Interview workspace</h1>
            <p className="card-sub">
              Shared Interview state stays synchronized with Student responses.
              Employer-private evaluation remains separate.
            </p>
          </div>
          <span className="pill pill-info">{interviews.length} in queue</span>
        </div>

        <div className="choice-row" style={{ marginBottom: 18 }}>
          {queues.map(([value, label]) => (
            <Link
              key={value}
              className={`choice-pill ${queue === value ? "selected" : ""}`}
              href={value === "all" ? "/employer/interviews" : `/employer/interviews?queue=${value}`}
            >
              {label}
            </Link>
          ))}
        </div>

        <div className="grid grid-2">
          {interviews.map((interview) => (
            <article className="card" key={interview.interviewRequestId}>
              <div className="card-header">
                <div className="profile-line">
                  <div className="avatar">{interview.studentName.slice(0, 1)}</div>
                  <div>
                    <h2>{interview.studentName}</h2>
                    <p className="card-sub">
                      {interview.roleTitle} · {interview.program ?? interview.institutionName ?? "Candidate"}
                    </p>
                  </div>
                </div>
                <span className={`pill ${
                  interview.status === "completed"
                    ? "pill-good"
                    : interview.status === "sent"
                      ? "pill-warn"
                      : "pill-info"
                }`}>
                  {interview.status.replaceAll("_", " ")}
                </span>
              </div>

              <div className="readiness-list">
                <div className="readiness-row">
                  <span>Source</span>
                  <strong>{interview.referralId ? "Referral-linked" : "Direct interview"}</strong>
                </div>
                <div className="readiness-row">
                  <span>Hiring Need</span>
                  <strong>{interview.hiringNeedTitle ?? "Direct"}</strong>
                </div>
                <div className="readiness-row">
                  <span>Sent</span>
                  <strong>{interview.sentAt ? new Date(interview.sentAt).toLocaleDateString() : "—"}</strong>
                </div>
                {interview.scheduledFor ? (
                  <div className="readiness-row">
                    <span>Scheduled</span>
                    <strong>{new Date(interview.scheduledFor).toLocaleString()}</strong>
                  </div>
                ) : null}
                {interview.evaluationNextStep ? (
                  <div className="readiness-row">
                    <span>Private next step</span>
                    <strong>{interview.evaluationNextStep.replaceAll("_", " ")}</strong>
                  </div>
                ) : null}
                {interview.placementId ? (
                  <div className="readiness-row">
                    <span>Placement</span>
                    <strong>{interview.placementStatus?.replaceAll("_", " ")}</strong>
                  </div>
                ) : null}
              </div>

              <div className="hero-actions">
                <Link
                  className="button button-dark"
                  href={`/employer/interviews/${encodeURIComponent(interview.interviewRequestId)}`}
                >
                  Open Interview
                </Link>
                {interview.placementId ? (
                  <Link
                    className="button button-ghost"
                    href={`/employer/placements/${encodeURIComponent(interview.placementId)}`}
                  >
                    Placement
                  </Link>
                ) : null}
              </div>
            </article>
          ))}
        </div>

        {!interviews.length ? (
          <div className="empty card">
            <strong>No interviews in this queue.</strong>
            Requests created from Candidate or Referral Detail will appear here.
          </div>
        ) : null}
      </main>
    </>
  );
}
