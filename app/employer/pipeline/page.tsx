import Link from "next/link";
import { Brand } from "@/components/brand";
import { EmployerWorkspaceNav } from "@/components/employer/workspace-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireEmployerContext } from "@/lib/employer/auth";
import {
  listEmployerInterviews,
  listEmployerPlacements,
} from "@/lib/employer/hiring-repository";
import { listReferrals } from "@/lib/employer/workflow-repository";

export const dynamic = "force-dynamic";

type Card = {
  key: string;
  studentId: string;
  studentName: string;
  title: string;
  detail: string;
  href: string;
  stage: "New / Referred" | "Interview Requested" | "Interviewing" | "Decision" | "Hire Scheduled" | "Active" | "Closed";
};

export default async function HiringPipelinePage() {
  const context = await requireEmployerContext({ approved: true });
  const [referrals, interviews, placements] = await Promise.all([
    listReferrals(context),
    listEmployerInterviews(context),
    listEmployerPlacements(context),
  ]);

  const cards = new Map<string, Card>();

  for (const referral of referrals) {
    const closed = ["closed", "expired", "interview_declined"].includes(referral.status);
    const interviewRequested = ["interview_requested", "interview_accepted"].includes(referral.status);
    cards.set(referral.studentId, {
      key: `referral:${referral.referralId}`,
      studentId: referral.studentId,
      studentName: referral.studentName,
      title: referral.hiringNeedTitle ?? "Referral",
      detail: `Referral · ${referral.status.replaceAll("_", " ")}`,
      href: `/employer/referrals/${encodeURIComponent(referral.referralId)}`,
      stage: closed ? "Closed" : interviewRequested ? "Interview Requested" : "New / Referred",
    });
  }

  for (const interview of interviews) {
    const stage: Card["stage"] =
      ["declined", "cancelled", "expired"].includes(interview.status)
        ? "Closed"
        : interview.status === "completed"
          ? "Decision"
          : ["accepted", "scheduling", "scheduled"].includes(interview.status)
            ? "Interviewing"
            : "Interview Requested";

    cards.set(interview.studentId, {
      key: `interview:${interview.interviewRequestId}`,
      studentId: interview.studentId,
      studentName: interview.studentName,
      title: interview.roleTitle,
      detail: `Interview · ${interview.status.replaceAll("_", " ")}`,
      href: `/employer/interviews/${encodeURIComponent(interview.interviewRequestId)}`,
      stage,
    });
  }

  for (const placement of placements) {
    const stage: Card["stage"] =
      placement.status === "active"
        ? "Active"
        : placement.status === "pending_start"
          ? "Hire Scheduled"
          : "Closed";
    cards.set(placement.studentId, {
      key: `placement:${placement.placementId}`,
      studentId: placement.studentId,
      studentName: placement.studentName,
      title: placement.roleTitle,
      detail: `Placement · ${placement.status.replaceAll("_", " ")}`,
      href: `/employer/placements/${encodeURIComponent(placement.placementId)}`,
      stage,
    });
  }

  const stages: Card["stage"][] = [
    "New / Referred",
    "Interview Requested",
    "Interviewing",
    "Decision",
    "Hire Scheduled",
    "Active",
    "Closed",
  ];

  const values = [...cards.values()];

  return (
    <>
      <header className="topbar">
        <Brand />
        <EmployerWorkspaceNav active="pipeline" />
        <ThemeToggle />
        <SignOutButton />
      </header>
      <main className="page-wrap">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Employer · Hiring Pipeline</p>
            <h1>Derived hiring view</h1>
            <p className="card-sub">
              Pipeline stages are derived from Placement → Interview → Referral precedence. No universal pipeline status is persisted.
            </p>
          </div>
          <span className="pill pill-neutral">{values.length} candidates</span>
        </div>

        <div className="callout" style={{ marginBottom: 18 }}>
          <strong>Read model only</strong>
          Cards are intentionally not draggable. Canonical workflow state changes occur inside Referral, Interview, and Placement records.
        </div>

        <div className="pipeline-board">
          {stages.map((stage) => {
            const stageCards = values.filter((card) => card.stage === stage);
            return (
              <section className="pipeline-column" key={stage}>
                <div className="pipeline-column-head">
                  <strong>{stage}</strong>
                  <span className="pill pill-neutral">{stageCards.length}</span>
                </div>
                <div className="grid">
                  {stageCards.map((card) => (
                    <Link className="pipeline-card" href={card.href} key={card.key}>
                      <strong>{card.studentName}</strong>
                      <span>{card.title}</span>
                      <small>{card.detail}</small>
                    </Link>
                  ))}
                  {!stageCards.length ? <div className="empty">No records</div> : null}
                </div>
              </section>
            );
          })}
        </div>
      </main>
    </>
  );
}
