import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { SignOutButton } from "@/components/sign-out-button";
import { StudentWorkspaceNav } from "@/components/student/workspace-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { getStudentContext } from "@/lib/student/auth";
import { getStudentReadinessEvidence } from "@/lib/student/learning-repository";

export const dynamic = "force-dynamic";

function date(value: string) {
  return new Date(value).toLocaleDateString();
}

export default async function StudentProfilePage() {
  const context = await getStudentContext();
  if (!context) redirect("/dashboard");
  const evidence = await getStudentReadinessEvidence(context.studentId);

  return (
    <>
      <header className="topbar">
        <Brand />
        <div className="header-actions"><ThemeToggle /><SignOutButton /></div>
      </header>
      <StudentWorkspaceNav active="profile" trainingCount={evidence.employerTraining.filter((item) => item.status !== "cancelled").length} />
      <main className="page-wrap student-training-page student-readiness-profile">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Student Profile</p>
            <h1>{[context.firstName, context.lastName].filter(Boolean).join(" ") || "My readiness evidence"}</h1>
            <p className="card-sub">Your evidence is grouped by its source. No combined readiness or employability score is calculated.</p>
          </div>
        </div>

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
      </main>
    </>
  );
}
