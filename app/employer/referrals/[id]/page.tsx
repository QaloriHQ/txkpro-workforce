import Link from "next/link";
import { notFound } from "next/navigation";
import { Brand } from "@/components/brand";
import { CloseReferralButton } from "@/components/employer/close-referral-button";
import { EmployerWorkspaceNav } from "@/components/employer/workspace-nav";
import { PrivateNoteForm } from "@/components/employer/private-note-form";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireEmployerContext } from "@/lib/employer/auth";
import { getReferralDetail } from "@/lib/employer/workflow-repository";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function yesNo(value: unknown) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (typeof value === "string" && value) return value;
  return "Not provided";
}

export default async function ReferralDetailPage({ params }: RouteContext) {
  const { id } = await params;
  const context = await requireEmployerContext({ approved: true });

  let referral;
  try {
    referral = await getReferralDetail(context, decodeURIComponent(id), {
      markViewed: true,
    });
  } catch {
    notFound();
  }

  const technical = objectValue(referral.technicalSnapshot);
  const operational = objectValue(referral.operationalSnapshot);
  const technicalSkills = arrayValue(technical.verifiedSkills);

  return (
    <>
      <header className="topbar">
        <Brand />
        <EmployerWorkspaceNav active="referrals" />
        <ThemeToggle />
        <SignOutButton />
      </header>

      <main className="page-wrap">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Referral Detail</p>
            <h1>{referral.studentName}</h1>
            <p className="card-sub">
              {referral.program ?? "Program"} · {referral.institutionName ?? "Institution"}
            </p>
          </div>
          <span className="pill pill-info">{referral.status.replaceAll("_", " ")}</span>
        </div>

        <div className="callout" style={{ marginBottom: 18 }}>
          <strong>Referral evidence snapshot</strong>
          The technical and operational evidence below reflects the information
          shared when the referral was created. Employer-private notes are stored
          separately and are not visible to the Student or Institution.
        </div>

        <div className="grid grid-2">
          <section className="card">
            <div className="card-header">
              <div>
                <h2>Technical Readiness</h2>
                <p className="card-sub">Institution-shared verified skill snapshot.</p>
              </div>
              <span className="pill pill-good">
                {Number(technical.verifiedSkillCount ?? technicalSkills.length)} verified
              </span>
            </div>
            <div className="skill-list">
              {technicalSkills.map((rawSkill, index) => {
                const skill = objectValue(rawSkill);
                return (
                  <div className="skill-row" key={String(skill.skillId ?? index)}>
                    <div>
                      <div className="skill-title">{String(skill.name ?? "Verified skill")}</div>
                      <div className="skill-meta">
                        {String(skill.provenance ?? "institution_verified").replaceAll("_", " ")}
                      </div>
                    </div>
                    <span className="pill pill-good">Verified</span>
                  </div>
                );
              })}
              {!technicalSkills.length ? (
                <div className="empty">No verified-skill snapshot was attached.</div>
              ) : null}
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <h2>Operational Readiness</h2>
                <p className="card-sub">Readiness statements shared with provenance.</p>
              </div>
            </div>
            <div className="readiness-list">
              <div className="readiness-row"><span>Driver’s license</span><strong>{yesNo(operational.driversLicense)}</strong></div>
              <div className="readiness-row"><span>Driving-record attestation</span><strong>{yesNo(operational.drivingRecordAttestation)}</strong></div>
              <div className="readiness-row"><span>Background-screen willingness</span><strong>{yesNo(operational.backgroundScreenWillingness)}</strong></div>
              <div className="readiness-row"><span>Drug-screen willingness</span><strong>{yesNo(operational.drugScreenWillingness)}</strong></div>
              <div className="readiness-row"><span>Work types</span><strong>{arrayValue(operational.workTypes).join(", ") || "Not provided"}</strong></div>
              <div className="readiness-row"><span>Shifts</span><strong>{arrayValue(operational.shifts).join(", ") || "Not provided"}</strong></div>
            </div>
          </section>
        </div>

        <div className="grid grid-2" style={{ marginTop: 18 }}>
          <section className="card">
            <h2>Referral context</h2>
            <div className="readiness-list" style={{ marginTop: 16 }}>
              <div className="readiness-row"><span>Referral ID</span><strong>{referral.referralId}</strong></div>
              <div className="readiness-row"><span>Hiring Need</span><strong>{referral.hiringNeedTitle ?? "Direct referral"}</strong></div>
              <div className="readiness-row"><span>Referred</span><strong>{referral.referredAt ? new Date(referral.referredAt).toLocaleString() : "—"}</strong></div>
              <div className="readiness-row"><span>First viewed</span><strong>{referral.viewedAt ? new Date(referral.viewedAt).toLocaleString() : "This view"}</strong></div>
            </div>
            {referral.institutionSharedNote ? (
              <div className="callout" style={{ marginTop: 16 }}>
                <strong>Institution-shared note</strong>
                {referral.institutionSharedNote}
              </div>
            ) : null}
          </section>

          <section className="card">
            <h2>Employer-private activity</h2>
            <p className="card-sub">
              Internal notes are scoped to {context.employerName} and never become
              Institution or Student data.
            </p>
            <div className="skill-list" style={{ marginTop: 16 }}>
              {referral.privateNotes.map((note) => (
                <div className="skill-row" key={note.noteId}>
                  <div>
                    <div className="skill-title">{note.note}</div>
                    <div className="skill-meta">
                      {note.createdAt ? new Date(note.createdAt).toLocaleString() : "Internal note"}
                    </div>
                  </div>
                  <span className="pill pill-neutral">Private</span>
                </div>
              ))}
              {!referral.privateNotes.length ? (
                <div className="empty">No Employer-private notes yet.</div>
              ) : null}
            </div>
            <div style={{ marginTop: 18 }}>
              <PrivateNoteForm
                studentId={referral.studentId}
                referralId={referral.referralId}
              />
            </div>
          </section>
        </div>

        <div className="hero-actions">
          <Link
            className="button button-brand"
            href={`/employer/talent/${encodeURIComponent(referral.studentId)}${referral.hiringNeedId ? `?hiringNeedId=${encodeURIComponent(referral.hiringNeedId)}` : ""}`}
          >
            Open Candidate
          </Link>
          <Link className="button button-ghost" href="/employer/referrals">
            Back to Referrals
          </Link>
          {!["hired", "closed", "expired"].includes(referral.status) ? (
            <CloseReferralButton referralId={referral.referralId} />
          ) : null}
        </div>
      </main>
    </>
  );
}
