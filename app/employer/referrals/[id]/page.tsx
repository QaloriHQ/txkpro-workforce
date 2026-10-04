import Link from "next/link";
import { Suspense } from "react";
import { CandidatePipelineProgress, HiringProgressLoading } from "@/components/employer/candidate-pipeline-progress";
import { notFound } from "next/navigation";
import { Brand } from "@/components/brand";
import { CloseReferralButton } from "@/components/employer/close-referral-button";
import { EmployerWorkspaceNav } from "@/components/employer/workspace-nav";
import { PrivateNoteForm } from "@/components/employer/private-note-form";
import { RequestInterviewForm } from "@/components/employer/request-interview-form";
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

function date(value: unknown) {
  return typeof value === "string" && value
    ? new Date(value).toLocaleDateString()
    : "—";
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
  const companyTraining = referral.companyTrainingSnapshot;
  const training = arrayValue(companyTraining?.training);
  const badges = arrayValue(companyTraining?.companyBadges);
  const certifications = arrayValue(companyTraining?.employerCertifications);

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

        <Suspense fallback={<HiringProgressLoading />}>
          <CandidatePipelineProgress context={context} studentId={referral.studentId} focus={{ kind: "referral", id: referral.referralId }} />
        </Suspense>

        <div className="callout" style={{ marginBottom: 18 }}>
          <strong>Referral evidence snapshot</strong>
          The technical, operational, and Company Training groups reflect the information
          shared when the referral was created. Employer-private notes are stored
          separately and are not visible to the Student or Institution.
        </div>

        <section className="card referral-company-training" aria-labelledby="referral-company-training-heading">
          <div className="card-header">
            <div>
              <h2 id="referral-company-training-heading">Company Training</h2>
              <p className="card-sub">
                Employer-specific evidence captured at referral time. It does not verify Instructor technical skills or create a combined readiness score.
              </p>
            </div>
          </div>
          {companyTraining ? (
            <>
              <p className="card-sub">
                Issuer: {String(companyTraining.employerName ?? "Employer")} · Captured {date(companyTraining.capturedAt)}.
                Statuses below reflect that date; verify a credential for its current status.
              </p>
              <div className="grid grid-2 referral-company-training-groups">
                <div>
                  <h3>Employer Training</h3>
                  <div className="skill-list">
                    {training.map((raw, index) => {
                      const item = objectValue(raw);
                      return (
                        <div className="skill-row" key={String(item.assignmentId ?? index)}>
                          <div>
                            <div className="skill-title">{String(item.courseTitle ?? "Company course")} · v{String(item.versionNumber ?? "—")}</div>
                            <div className="skill-meta">
                              {String(item.statusAtReferral ?? "assigned").replaceAll("_", " ")} at referral
                              {item.passedAt ? ` · passed ${date(item.passedAt)}` : " · no passed completion captured"}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {!training.length ? <div className="empty">No training assignment from this Employer was captured.</div> : null}
                  </div>
                </div>
                <div>
                  <h3>Company Badges</h3>
                  <div className="skill-list">
                    {badges.map((raw, index) => {
                      const item = objectValue(raw);
                      return (
                        <div className="skill-row" key={String(item.awardId ?? index)}>
                          <div>
                            <div className="skill-title">{String(item.badgeTitle ?? "Company Badge")}</div>
                            <div className="skill-meta">
                              {String(item.issuer ?? "Employer")} · {String(item.courseTitle ?? "Company course")} v{String(item.versionNumber ?? "—")}
                              {` · issued ${date(item.issuedAt)}`}
                              {item.expiresAt ? ` · expires ${date(item.expiresAt)}` : ""}
                            </div>
                          </div>
                          <span className="pill pill-neutral">{String(item.statusAtReferral ?? "unknown")}</span>
                        </div>
                      );
                    })}
                    {!badges.length ? <div className="empty">No Company Badge was captured.</div> : null}
                  </div>
                </div>
                <div>
                  <h3>Employer Certifications</h3>
                  <div className="skill-list">
                    {certifications.map((raw, index) => {
                      const item = objectValue(raw);
                      const credentialId = String(item.credentialId ?? "");
                      return (
                        <div className="skill-row" key={credentialId || index}>
                          <div>
                            <div className="skill-title">{String(item.title ?? "Employer Certification")}</div>
                            <div className="skill-meta">
                              Issued by {String(item.issuer ?? "Employer")} · {String(item.courseTitle ?? "Company course")} v{String(item.versionNumber ?? "—")}
                              {` · passed ${date(item.passedAt)} · issued ${date(item.issuedAt)}`}
                              {item.expiresAt ? ` · expires ${date(item.expiresAt)}` : ""}
                            </div>
                            {credentialId ? <div className="skill-meta"><Link href={`/credentials/${encodeURIComponent(credentialId)}`}>Verify {credentialId}</Link></div> : null}
                          </div>
                          <span className="pill pill-neutral">{String(item.statusAtReferral ?? "unknown")}</span>
                        </div>
                      );
                    })}
                    {!certifications.length ? <div className="empty">No formal Employer Certification was captured.</div> : null}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="empty">This referral predates Company Training snapshots. Historical evidence was not reconstructed from current records.</div>
          )}
        </section>

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

        {context.role !== "employer_read_only" && !["hired", "closed", "expired"].includes(referral.status) ? (
          <section className="card" style={{ marginTop: 18 }}>
            <div className="card-header">
              <div>
                <h2>Interview Request</h2>
                <p className="card-sub">
                  This request stays linked to the Referral while Interview and Referral retain separate canonical states.
                </p>
              </div>
            </div>
            <RequestInterviewForm
              studentId={referral.studentId}
              hiringNeedId={referral.hiringNeedId}
              referralId={referral.referralId}
              defaultRoleTitle={referral.hiringNeedTitle}
              defaultTradeId={referral.primaryTradeId}
            />
          </section>
        ) : null}

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
