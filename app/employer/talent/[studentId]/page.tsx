import Link from "next/link";
import { notFound } from "next/navigation";
import { Brand } from "@/components/brand";
import { EmployerWorkspaceNav } from "@/components/employer/workspace-nav";
import { SaveCandidateButton } from "@/components/employer/save-candidate-button";
import { RequestInterviewForm } from "@/components/employer/request-interview-form";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireEmployerContext } from "@/lib/employer/auth";
import { listHiringNeeds } from "@/lib/employer/repository";
import { getTalentCandidate } from "@/lib/employer/workflow-repository";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function readinessLabel(value: boolean | null) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "Not provided";
}

export default async function CandidateDetailPage({
  params,
  searchParams,
}: RouteContext) {
  const { studentId } = await params;
  const query = await searchParams;
  const requestedHiringNeedId = one(query.hiringNeedId) ?? null;
  const context = await requireEmployerContext({ approved: true });
  const hiringNeedId =
    requestedHiringNeedId ??
    (context.role === "hiring_manager"
      ? (await listHiringNeeds(context))[0]?.hiringNeedId ?? null
      : null);
  if (context.role === "hiring_manager" && !hiringNeedId) notFound();

  const candidate = await getTalentCandidate(
    context,
    decodeURIComponent(studentId),
    hiringNeedId,
  );
  if (!candidate) notFound();

  const fit = candidate.hiringNeedFit;
  const provenance = candidate.readiness.provenance;

  return (
    <>
      <header className="topbar">
        <Brand />
        <EmployerWorkspaceNav active="talent" />
        <ThemeToggle />
        <SignOutButton />
      </header>

      <main className="page-wrap">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Talent · Candidate Profile</p>
            <h1>{candidate.displayName}</h1>
            <p className="card-sub">
              {candidate.program ?? "Program"} · {candidate.institutionName ?? "Institution"}
            </p>
          </div>
          <SaveCandidateButton
            studentId={candidate.studentId}
            hiringNeedId={hiringNeedId}
            saved={Boolean(candidate.savedCandidateId)}
          />
        </div>

        <div className="callout" style={{ marginBottom: 18 }}>
          <strong>Evidence is separated by source.</strong>
          Instructor/Institution Verified Skills are read-only to the Employer.
          Operational readiness shown below is self-attested unless its provenance says otherwise.
        </div>

        <div className="grid grid-2">
          <section className="card">
            <div className="card-header">
              <div>
                <h2>Technical Readiness</h2>
                <p className="card-sub">Instructor or Institution verified skill evidence.</p>
              </div>
              <span className="pill pill-good">{candidate.verifiedSkillCount} verified</span>
            </div>
            <div className="skill-list">
              {candidate.verifiedSkills.map((skill) => (
                <div className="skill-row" key={skill.skillId}>
                  <div>
                    <div className="skill-title">{skill.name}</div>
                    <div className="skill-meta">
                      {skill.category ?? "Skill"} · {skill.provenance.replaceAll("_", " ")}
                      {skill.verifiedAt ? ` · Verified ${new Date(skill.verifiedAt).toLocaleDateString()}` : ""}
                    </div>
                  </div>
                  <span className="pill pill-good">Verified</span>
                </div>
              ))}
              {!candidate.verifiedSkills.length ? (
                <div className="empty">No verified skills are visible for this candidate.</div>
              ) : null}
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <h2>Operational Readiness</h2>
                <p className="card-sub">Explicit readiness statements with provenance.</p>
              </div>
            </div>
            <div className="readiness-list">
              <div className="readiness-row">
                <span>Driver’s license</span>
                <strong>{candidate.readiness.driversLicense ?? "Not provided"}</strong>
              </div>
              <div className="readiness-row">
                <span>Driving-record attestation</span>
                <strong>{readinessLabel(candidate.readiness.drivingRecordAttestation)}</strong>
              </div>
              <div className="readiness-row">
                <span>Background-screen willingness</span>
                <strong>{readinessLabel(candidate.readiness.backgroundScreenWillingness)}</strong>
              </div>
              <div className="readiness-row">
                <span>Drug-screen willingness</span>
                <strong>{readinessLabel(candidate.readiness.drugScreenWillingness)}</strong>
              </div>
              <div className="readiness-row">
                <span>Work types</span>
                <strong>{candidate.readiness.workTypes.join(", ") || "Not provided"}</strong>
              </div>
              <div className="readiness-row">
                <span>Shifts</span>
                <strong>{candidate.readiness.shifts.join(", ") || "Not provided"}</strong>
              </div>
            </div>
            <p className="footer-note">
              Provenance: {Object.values(provenance).length
                ? [...new Set(Object.values(provenance))].join(", ").replaceAll("_", " ")
                : "not provided"}. These are readiness representations, not final eligibility determinations.
            </p>
          </section>
        </div>

        <div className="grid grid-2" style={{ marginTop: 18 }}>
          <section className="card">
            <h2>Candidate context</h2>
            <div className="readiness-list" style={{ marginTop: 16 }}>
              <div className="readiness-row"><span>Location</span><strong>{[candidate.city, candidate.state].filter(Boolean).join(", ") || "—"}</strong></div>
              <div className="readiness-row"><span>Graduation</span><strong>{candidate.graduationDate ?? candidate.graduationYear ?? "—"}</strong></div>
              <div className="readiness-row"><span>Available start</span><strong>{candidate.availableStartDate ?? "—"}</strong></div>
              <div className="readiness-row"><span>Referral state</span><strong>{candidate.referralStatus?.replaceAll("_", " ") ?? "Not referred"}</strong></div>
            </div>
          </section>

          <section className="card">
            <h2>Hiring Need criteria</h2>
            {fit ? (
              <>
                <p className="card-sub">
                  Explicit criteria comparison for {fit.title}. This is not a ranking, recommendation, or employability score.
                </p>
                <div className="readiness-list" style={{ marginTop: 16 }}>
                  {[
                    ["Trade", fit.trade],
                    ["Minimum verified skills", fit.minimumVerifiedSkills],
                    ["Required verified skills", fit.requiredSkills],
                    ["Driver’s license", fit.driversLicense],
                    ["Driving-record attestation", fit.drivingRecordAttestation],
                    ["Background-screen willingness", fit.backgroundWillingness],
                    ["Drug-screen willingness", fit.drugScreenWillingness],
                  ].map(([label, met]) => (
                    <div className="readiness-row" key={String(label)}>
                      <span>{String(label)}</span>
                      <span className={`pill ${met ? "pill-good" : "pill-neutral"}`}>
                        {met ? "Meets criterion" : "Does not meet / not provided"}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="card-sub">Select a Hiring Need from Talent to compare explicit criteria.</p>
            )}
          </section>
        </div>

        {context.role !== "employer_read_only" ? (
          <section className="card" style={{ marginTop: 18 }}>
            <div className="card-header">
              <div>
                <h2>Request Interview</h2>
                <p className="card-sub">
                  Create a shared Interview Request. The Student controls the response.
                </p>
              </div>
              <span className="pill pill-info">Human workflow</span>
            </div>
            <RequestInterviewForm
              studentId={candidate.studentId}
              hiringNeedId={hiringNeedId}
              defaultRoleTitle={fit?.title ?? null}
              defaultTradeId={candidate.primaryTradeId}
            />
          </section>
        ) : null}

        <div className="hero-actions">
          <Link className="button button-ghost" href="/employer/talent">Back to Talent</Link>
          {candidate.referralStatus ? (
            <Link className="button button-dark" href="/employer/referrals">
              View Referrals
            </Link>
          ) : null}
        </div>
      </main>
    </>
  );
}
