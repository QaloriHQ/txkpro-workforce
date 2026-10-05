import Image from "next/image";
import { ProjectDescription, SkillPills, FileCard } from "./portfolio-cards";
import { ProfilePanels } from "./profile-layout";
import Link from "next/link";
import type { StudentPortfolio } from "@/lib/student-portfolio/types";
const fileUrl = (id: string) =>
  `/api/student/portfolio/files/${encodeURIComponent(id)}`;
export function PortfolioView({
  portfolio,
  displayName,
  headline,
  bio,
  publicView = false,
  identityOnly = false,
  headingLevel = 1,
}: {
  portfolio: StudentPortfolio;
  displayName: string;
  headline?: string | null;
  bio?: string | null;
  publicView?: boolean;
  identityOnly?: boolean;
  headingLevel?: 1 | 2;
}) {
  const { preferences, projects, files, evidence = [] } = portfolio;
  const documents = files.filter((f) =>
    ["resume", "certificate", "document"].includes(f.kind),
  );
  const labels = {
    instructor_verified: "Instructor Verified Skill",
    employer_training: "Completed Employer Training",
    company_badge: "Earned Company Badge",
    employer_certification: "Employer Certification",
  };
  return (
    <div className="student-portfolio-view">
      <article className="card portfolio-identity">
        <div className="portfolio-cover">
          {preferences.coverId ? (
            <Image
              src={fileUrl(preferences.coverId)}
              alt="Student-selected cover image"
              fill
              sizes="(max-width: 760px) 100vw, 960px"
              unoptimized
            />
          ) : (
            <div className="portfolio-cover-pattern" />
          )}
        </div>
        <div className="portfolio-identity-body">
          <div className="portfolio-avatar">
            {preferences.photoId ? (
              <Image
                src={fileUrl(preferences.photoId)}
                alt={`${displayName} profile photo`}
                width={112}
                height={112}
                unoptimized
              />
            ) : (
              <span aria-hidden="true">
                {displayName.slice(0, 1).toUpperCase()}
              </span>
            )}
          </div>
          <p className="eyebrow">Skilled trades · Student portfolio</p>
          {headingLevel === 2 ? <h2>{displayName}</h2> : <h1>{displayName}</h1>}
          {headline ? <p className="portfolio-headline">{headline}</p> : null}
          {bio ? <p className="portfolio-text">{bio}</p> : null}
        </div>
      </article>
      {!identityOnly ? <ProfilePanels preferences={preferences} panels={{ credentials: evidence.length ? (
        <section className="card">
          <h2>Skills & credentials</h2>
          <p className="card-sub">
            Each achievement retains its source. Employer Training is distinct
            from Instructor Verified Skills.
          </p>
          <div className="portfolio-grid">
            {evidence.map((e) => (
              <article className="portfolio-item" key={`${e.category}-${e.id}`}>
                <span className="pill pill-info">{labels[e.category]}</span>
                <h3>{e.title}</h3>
                <p>
                  {e.issuer}
                  {e.version ? ` · Version ${e.version}` : ""}
                </p>
                <p className="muted">
                  {e.status}
                  {e.date
                    ? ` · ${new Date(e.date).toISOString().slice(0, 10)}`
                    : ""}
                  {e.expiresAt
                    ? ` · Expires ${new Date(e.expiresAt).toISOString().slice(0, 10)}`
                    : ""}
                </p>
                {e.category === "employer_certification" ? (
                  <Link href={`/credentials/${encodeURIComponent(e.id)}`}>
                    Verify credential
                  </Link>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null, projects: projects.length ? (
        <section className="card">
          <h2>Project portfolio</h2>
          <p className="card-sub">
            Projects and demonstrated skills below are supplied by the Student.
          </p>
          <div className="portfolio-grid">
            {projects.map((p) => (
              <article className="portfolio-item" key={p.id}>
                {p.imageId ? (
                  <div className="portfolio-project-image">
                    <Image
                      src={fileUrl(p.imageId)}
                      alt={p.title}
                      fill
                      sizes="(max-width: 760px) 100vw, 440px"
                      unoptimized
                    />
                  </div>
                ) : null}
                <span className="pill">Student-entered project</span>
                <h3>{p.title}</h3>
                <ProjectDescription text={p.description} />
                <SkillPills skills={p.skills} />
                {!publicView ? (
                  <p className="muted">
                    {p.visibility === "public"
                      ? "Shared when your profile is public"
                      : "Private project"}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null, files: documents.length ? (
        <section className="card">
          <h2>Resume & documents</h2>
          <p className="card-sub">
            Student-uploaded documents are not independently verified
            credentials.
          </p>
          <div className="portfolio-file-gallery">
            {documents.map((f) => (
              <article className="portfolio-item" key={f.id}><FileCard file={f} /></article>
            ))}
          </div>
        </section>
      ) : null }} /> : null}
    </div>
  );
}
