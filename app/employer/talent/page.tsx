import Link from "next/link";
import { Brand } from "@/components/brand";
import { EmployerWorkspaceNav } from "@/components/employer/workspace-nav";
import { SaveCandidateButton } from "@/components/employer/save-candidate-button";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireEmployerContext } from "@/lib/employer/auth";
import { listHiringNeeds } from "@/lib/employer/repository";
import { searchTalent } from "@/lib/employer/workflow-repository";
import type { TalentFilters } from "@/lib/employer/types";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function truthy(value: string | undefined) {
  return value === "1" || value === "true" || value === "on";
}

export default async function EmployerTalentPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const context = await requireEmployerContext({ approved: true });
  const params = await searchParams;
  const requestedHiringNeedId = one(params.hiringNeedId) ?? null;
  const hiringNeeds = await listHiringNeeds(context);
  const hiringNeedId =
    requestedHiringNeedId ??
    (context.role === "hiring_manager"
      ? hiringNeeds[0]?.hiringNeedId ?? null
      : null);

  const filters: TalentFilters = {
    institutionId: one(params.institutionId) || undefined,
    program: one(params.program) || undefined,
    graduation: one(params.graduation) || undefined,
    location: one(params.location) || undefined,
    skillIds: one(params.skillId) ? [one(params.skillId)!] : undefined,
    minVerifiedSkillCount: one(params.minVerifiedSkillCount)
      ? Number(one(params.minVerifiedSkillCount))
      : undefined,
    driversLicense: truthy(one(params.driversLicense)),
    drivingRecordAttestation: truthy(one(params.drivingRecordAttestation)),
    backgroundWillingness: truthy(one(params.backgroundWillingness)),
    drugScreenWillingness: truthy(one(params.drugScreenWillingness)),
    workType: one(params.workType) || undefined,
    shift: one(params.shift) || undefined,
    referralState: one(params.referralState) || undefined,
  };

  if (context.role === "hiring_manager" && !hiringNeedId) {
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
              <p className="eyebrow">Employer · Talent</p>
              <h1>No assigned Hiring Need</h1>
              <p className="card-sub">
                Hiring Manager Talent access is scoped to assigned Hiring Needs.
              </p>
            </div>
          </div>
          <div className="alert">
            Ask an Employer Owner, Admin, or Recruiter to assign a Hiring Need.
          </div>
        </main>
      </>
    );
  }

  const [allCandidates, candidates] = await Promise.all([
    searchTalent(context, { hiringNeedId }),
    searchTalent(context, { hiringNeedId, filters }),
  ]);

  const institutions = [...new Map(
    allCandidates
      .filter((candidate) => candidate.institutionId)
      .map((candidate) => [
        candidate.institutionId!,
        candidate.institutionName ?? candidate.institutionId!,
      ]),
  ).entries()];
  const programs = [...new Set(allCandidates.map((candidate) => candidate.program).filter(Boolean))] as string[];
  const skills = [...new Map(
    allCandidates.flatMap((candidate) =>
      candidate.verifiedSkills.map((skill) => [skill.skillId, skill.name] as const),
    ),
  ).entries()];

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
            <p className="eyebrow">Employer · Talent</p>
            <h1>Discover verified local talent</h1>
            <p className="card-sub">
              Deterministic filters only. Results show explicit readiness signals
              and provenance; they are not hiring recommendations.
            </p>
          </div>
          <span className="pill pill-good">{candidates.length} visible candidates</span>
        </div>

        <section className="card">
          <form method="get">
            <div className="form-grid">
              <label>
                <span>Hiring Need</span>
                <select className="select" name="hiringNeedId" defaultValue={hiringNeedId ?? ""}>
                  <option value="">All authorized Talent</option>
                  {hiringNeeds.map((need) => (
                    <option value={need.hiringNeedId} key={need.hiringNeedId}>
                      {need.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Institution</span>
                <select className="select" name="institutionId" defaultValue={filters.institutionId ?? ""}>
                  <option value="">All authorized institutions</option>
                  {institutions.map(([id, label]) => (
                    <option value={id} key={id}>{label}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Program</span>
                <select className="select" name="program" defaultValue={filters.program ?? ""}>
                  <option value="">All programs</option>
                  {programs.map((program) => <option key={program}>{program}</option>)}
                </select>
              </label>
              <label>
                <span>Graduation</span>
                <input className="input" name="graduation" defaultValue={filters.graduation ?? ""} placeholder="2027 or Spring 2027" />
              </label>
              <label>
                <span>Verified skill</span>
                <select className="select" name="skillId" defaultValue={filters.skillIds?.[0] ?? ""}>
                  <option value="">Any verified skill</option>
                  {skills.map(([id, label]) => <option value={id} key={id}>{label}</option>)}
                </select>
              </label>
              <label>
                <span>Minimum verified skills</span>
                <input className="input" type="number" min="0" name="minVerifiedSkillCount" defaultValue={filters.minVerifiedSkillCount ?? ""} />
              </label>
              <label>
                <span>Work type</span>
                <input className="input" name="workType" defaultValue={filters.workType ?? ""} placeholder="Full-time" />
              </label>
              <label>
                <span>Shift</span>
                <input className="input" name="shift" defaultValue={filters.shift ?? ""} placeholder="Day" />
              </label>
              <label>
                <span>Location</span>
                <input className="input" name="location" defaultValue={filters.location ?? ""} placeholder="Texarkana" />
              </label>
              <label>
                <span>Referral state</span>
                <select className="select" name="referralState" defaultValue={filters.referralState ?? ""}>
                  <option value="">Any referral state</option>
                  <option value="none">Not referred</option>
                  <option value="delivered">Delivered</option>
                  <option value="viewed">Viewed</option>
                  <option value="interview_requested">Interview requested</option>
                  <option value="closed">Closed</option>
                </select>
              </label>
            </div>

            <div className="check-grid" style={{ marginTop: 14 }}>
              {[
                ["driversLicense", "Valid driver’s license", filters.driversLicense],
                ["drivingRecordAttestation", "Driving-record attestation", filters.drivingRecordAttestation],
                ["backgroundWillingness", "Background-screen willingness", filters.backgroundWillingness],
                ["drugScreenWillingness", "Drug-screen willingness", filters.drugScreenWillingness],
              ].map(([name, label, checked]) => (
                <label className="check-card" key={String(name)}>
                  <input type="checkbox" name={String(name)} defaultChecked={Boolean(checked)} />
                  <span>{String(label)}</span>
                </label>
              ))}
            </div>

            <div className="hero-actions" style={{ marginTop: 16 }}>
              <button className="button button-dark" type="submit">Apply filters</button>
              <Link className="button button-ghost" href="/employer/talent">Clear</Link>
            </div>
          </form>
        </section>

        <div className="grid grid-2" style={{ marginTop: 18 }}>
          {candidates.map((candidate) => {
            const fit = candidate.hiringNeedFit;
            const fitSignals = fit
              ? [
                  fit.trade,
                  fit.minimumVerifiedSkills,
                  fit.requiredSkills,
                  fit.driversLicense,
                  fit.drivingRecordAttestation,
                  fit.backgroundWillingness,
                  fit.drugScreenWillingness,
                ]
              : [];
            const explicitCriteriaMet = fit ? fitSignals.filter(Boolean).length : null;

            return (
              <article className="card" key={candidate.studentId}>
                <div className="card-header">
                  <div className="profile-line">
                    <div className="avatar">{candidate.displayName.slice(0, 1)}</div>
                    <div>
                      <h2>{candidate.displayName}</h2>
                      <p className="card-sub">
                        {candidate.program ?? "Program"} · {candidate.institutionName ?? "Institution"}
                      </p>
                    </div>
                  </div>
                  {candidate.referralStatus ? (
                    <span className="pill pill-info">{candidate.referralStatus.replaceAll("_", " ")}</span>
                  ) : null}
                </div>

                <div className="readiness-list">
                  <div className="readiness-row"><span>Verified skills</span><strong>{candidate.verifiedSkillCount}</strong></div>
                  <div className="readiness-row"><span>Graduation</span><strong>{candidate.graduationDate ?? candidate.graduationYear ?? "—"}</strong></div>
                  <div className="readiness-row"><span>Location</span><strong>{[candidate.city, candidate.state].filter(Boolean).join(", ") || "—"}</strong></div>
                  <div className="readiness-row"><span>Driver’s license</span><strong>{candidate.readiness.driversLicense ?? "Not provided"}</strong></div>
                </div>

                {fit ? (
                  <div className="callout" style={{ marginTop: 14 }}>
                    <strong>Hiring Need criteria</strong>
                    {explicitCriteriaMet} of {fitSignals.length} explicit criteria currently met for <em>{fit.title}</em>.
                    This is not a score or recommendation.
                  </div>
                ) : null}

                <div className="skill-meta" style={{ marginTop: 14 }}>
                  {candidate.verifiedSkills.slice(0, 4).map((skill) => skill.name).join(" · ") || "No verified skills visible"}
                </div>

                <div className="hero-actions" style={{ marginTop: 16 }}>
                  <Link
                    className="button button-dark"
                    href={`/employer/talent/${encodeURIComponent(candidate.studentId)}${hiringNeedId ? `?hiringNeedId=${encodeURIComponent(hiringNeedId)}` : ""}`}
                  >
                    View Candidate
                  </Link>
                  <SaveCandidateButton
                    studentId={candidate.studentId}
                    hiringNeedId={hiringNeedId}
                    saved={Boolean(candidate.savedCandidateId)}
                  />
                </div>
              </article>
            );
          })}
        </div>

        {!candidates.length ? (
          <div className="empty card" style={{ marginTop: 18 }}>
            <strong>No candidates match these explicit filters.</strong>
            Adjust the criteria or choose another Hiring Need. No candidates are automatically rejected.
          </div>
        ) : null}
      </main>
    </>
  );
}
