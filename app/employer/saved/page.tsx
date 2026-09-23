import Link from "next/link";
import { Brand } from "@/components/brand";
import { EmployerWorkspaceNav } from "@/components/employer/workspace-nav";
import { SaveCandidateButton } from "@/components/employer/save-candidate-button";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireEmployerContext } from "@/lib/employer/auth";
import { listHiringNeeds } from "@/lib/employer/repository";
import { listSavedTalent } from "@/lib/employer/workflow-repository";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SavedCandidatesPage({
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
  const candidates =
    context.role === "hiring_manager" && !hiringNeedId
      ? []
      : await listSavedTalent(context, hiringNeedId);

  return (
    <>
      <header className="topbar">
        <Brand />
        <EmployerWorkspaceNav active="saved" />
        <ThemeToggle />
        <SignOutButton />
      </header>
      <main className="page-wrap">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Employer · Saved Candidates</p>
            <h1>Private shortlist</h1>
            <p className="card-sub">
              Saved Candidates are Employer-private workflow metadata. Saving a
              candidate does not alter Student discoverability or Institution data.
            </p>
          </div>
          <span className="pill pill-info">{candidates.length} saved</span>
        </div>

        <section className="card">
          <form method="get" className="filter-bar">
            <select className="select" name="hiringNeedId" defaultValue={hiringNeedId ?? ""}>
              <option value="">All Hiring Needs</option>
              {hiringNeeds.map((need) => (
                <option key={need.hiringNeedId} value={need.hiringNeedId}>{need.title}</option>
              ))}
            </select>
            <button className="button button-dark" type="submit">Filter</button>
            <Link className="button button-ghost" href="/employer/saved">Clear</Link>
          </form>
        </section>

        <div className="grid grid-2" style={{ marginTop: 18 }}>
          {candidates.map((candidate) => (
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
                <span className="pill pill-neutral">Employer-private</span>
              </div>
              <div className="readiness-list">
                <div className="readiness-row"><span>Verified skills</span><strong>{candidate.verifiedSkillCount}</strong></div>
                <div className="readiness-row"><span>Graduation</span><strong>{candidate.graduationDate ?? candidate.graduationYear ?? "—"}</strong></div>
                <div className="readiness-row"><span>Referral state</span><strong>{candidate.referralStatus?.replaceAll("_", " ") ?? "Not referred"}</strong></div>
              </div>
              <div className="hero-actions">
                <Link
                  className="button button-dark"
                  href={`/employer/talent/${encodeURIComponent(candidate.studentId)}${hiringNeedId ? `?hiringNeedId=${encodeURIComponent(hiringNeedId)}` : ""}`}
                >
                  Open Candidate
                </Link>
                <SaveCandidateButton
                  studentId={candidate.studentId}
                  hiringNeedId={hiringNeedId}
                  saved
                />
              </div>
            </article>
          ))}
        </div>

        {!candidates.length ? (
          <div className="empty card" style={{ marginTop: 18 }}>
            <strong>No Saved Candidates in this view.</strong>
            Save candidates from Talent to build a private shortlist.
          </div>
        ) : null}
      </main>
    </>
  );
}
