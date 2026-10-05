import { PortfolioView } from "@/components/student/portfolio-view";
import { PortfolioEditor } from "@/components/student/portfolio-editor";
import { ProfilePanels } from "@/components/student/profile-layout";
import { studentPortfolio } from "@/lib/student-portfolio/repository";
import { StudentWorkspaceHeader } from "@/components/student/workspace-header";
import { studentPublicSettings } from "@/lib/student-public-profile/repository";
import { StudentPublicProfileSettings } from "@/components/student/public-profile-settings";
import Link from "next/link";
import { redirect } from "next/navigation";
import { StudentWorkspaceNav } from "@/components/student/workspace-nav";
import { getStudentContext } from "@/lib/student/auth";
import { getStudentReadinessEvidence, getStudentTrainingExposure } from "@/lib/student/learning-repository";

export const dynamic = "force-dynamic";

function date(value: string) {
  return new Date(value).toLocaleDateString();
}

export default async function StudentProfilePage() {
  const context = await getStudentContext();
  if (!context) redirect("/dashboard");
  const [evidence, exposure, publicSettings, portfolio] = await Promise.all([
    getStudentReadinessEvidence(context.studentId),
    getStudentTrainingExposure(),
    studentPublicSettings(),
    studentPortfolio(),
  ]);

  return (
    <>
      <StudentWorkspaceHeader firstName={context.firstName} lastName={context.lastName} />
      <StudentWorkspaceNav active="profile" trainingCount={evidence.employerTraining.filter((item) => item.status !== "cancelled").length} />
      <main className="student-training-page student-readiness-profile student-profile-page">
        <PortfolioView portfolio={portfolio} displayName={publicSettings.displayName || [context.firstName, context.lastName].filter(Boolean).join(" ")} headline={publicSettings.headline} bio={publicSettings.bio} identityOnly />
        <div className="profile-owner-controls"><StudentPublicProfileSettings initial={publicSettings} suggestedName={[context.firstName, context.lastName].join(" ")} identityOnly /><PortfolioEditor initial={portfolio} section="images" /><Link className="button" href="/student/profile/edit">Profile editor</Link></div>
        <ProfilePanels preferences={portfolio.preferences} panels={{ projects: <PortfolioEditor initial={portfolio} section="projects" />, files: <PortfolioEditor initial={portfolio} section="files" />, credentials: <>
        <div className="profile-panel-heading"><h2>Skills & credentials</h2><Link className="button" href="/student/profile/edit">Edit sharing</Link></div>
        <section className="card">
          <div className="card-header"><div><p className="eyebrow">Technical readiness</p><h2>Instructor Verified Skills</h2><p className="card-sub">Technical competencies verified by an Instructor. Employer Training does not create these records.</p></div></div>
          <div className="grid grid-2">
            {evidence.verifiedSkills.map((skill) => (
              <div className="metric-card" key={skill.studentSkillId}>
                <strong>{skill.name}</strong>
                <small>{skill.category ?? "Skill"} · Instructor verified{skill.verifiedAt ? ` ${date(skill.verifiedAt)}` : ""}</small>
                {skill.provenance ? <small>Source: {skill.provenance}</small> : null}
              </div>
            ))}
          </div>
          {!evidence.verifiedSkills.length ? <div className="empty">No Instructor Verified Skills recorded yet.</div> : null}
        </section>

        <section className="card">
          <div className="card-header"><div><p className="eyebrow">Employer-specific readiness</p><h2>Employer Training</h2><p className="card-sub">Assignments show the issuing Employer, exact course version, and current completion state.</p></div></div>
          <div className="grid grid-2">
            {evidence.employerTraining.map((assignment) => (
              <div className="metric-card" key={assignment.assignmentId}>
                <strong>{assignment.courseTitle}</strong>
                <small>{assignment.employerName} · Version {assignment.versionNumber}</small>
                <small>{assignment.status.replaceAll("_", " ")}{assignment.completedAt ? ` · completed ${date(assignment.completedAt)}` : ""}</small>
                <Link href={`/student/employer-training/${encodeURIComponent(assignment.assignmentId)}`}>View training</Link>
              </div>
            ))}
          </div>
          {!evidence.employerTraining.length ? <div className="empty">No Employer Training assignments yet.</div> : null}
        </section>

        <section className="card">
          <div className="card-header"><div><p className="eyebrow">Employer-specific readiness</p><h2>Company Badges</h2><p className="card-sub">Employer-issued badge outcomes are distinct from formal certifications.</p></div></div>
          <div className="grid grid-2">
            {evidence.companyBadges.map((badge) => (
              <div className="metric-card" key={badge.awardId}>
                <strong>{badge.title}</strong>
                <small>Issued by {badge.employerName} · {date(badge.issuedAt)}</small>
                <small>{badge.courseTitle ? `${badge.courseTitle} v${badge.versionNumber}` : badge.evidenceType}{badge.completedAt ? ` · passed ${date(badge.completedAt)}` : ""}</small>
                <small>{badge.status}{badge.expiresAt ? ` · expires ${date(badge.expiresAt)}` : ""}</small>
              </div>
            ))}
          </div>
          {!evidence.companyBadges.length ? <div className="empty">No Company Badges earned yet.</div> : null}
        </section>

        <section className="card">
          <div className="card-header"><div><p className="eyebrow">Employer-specific readiness</p><h2>Employer Certifications</h2><p className="card-sub">Formal credentials are backed by a passed course completion and can be verified individually.</p></div></div>
          <div className="grid grid-2">
            {evidence.employerCertifications.map((certification) => (
              <div className="metric-card" key={certification.credentialId}>
                <strong>{certification.title}</strong>
                <small>Issued by {certification.employerName} · {certification.courseTitle} v{certification.versionNumber}</small>
                <small>Passed completion {date(certification.completedAt)} · issued {date(certification.issuedAt)}</small>
                <small>{certification.status}{certification.expiresAt ? ` · expires ${date(certification.expiresAt)}` : ""} · {certification.credentialId}</small>
                <Link href={`/credentials/${encodeURIComponent(certification.credentialId)}`}>Verify credential</Link>
              </div>
            ))}
          </div>
          {!evidence.employerCertifications.length ? <div className="empty">No Employer Certifications issued yet.</div> : null}
        </section>
        </> }} />
        <div className="profile-private-activity">
        <section className="card">
          <div className="card-header"><div><p className="eyebrow">Observed engagement</p><h2>Employer Training activity</h2><p className="card-sub">Previews, starts, and passed completions reflect recorded activity only. They do not indicate employment intent or Instructor Verified Skills.</p></div></div>
          <div className="grid grid-2">
            {exposure.map((item) => (
              <div className="metric-card" key={item.exposureEventId}>
                <strong>{item.courseTitle ?? "Employer Training"}</strong>
                <small>{item.employerName} · {item.eventType === "EMPLOYER_TRAINING_PREVIEWED" ? "Previewed" : item.eventType === "EMPLOYER_TRAINING_STARTED" ? "Started" : "Completed"} · {date(item.occurredAt)}</small>
              </div>
            ))}
          </div>
          {!exposure.length ? <div className="empty">No observed Employer Training activity yet.</div> : null}
        </section>

        </div>
      </main>
    </>
  );
}
