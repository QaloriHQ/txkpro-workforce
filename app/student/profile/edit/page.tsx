import Link from "next/link";
import {pointsSummary} from "@/lib/pro-points/server";
import {SystemBadgeVisibility} from "@/components/pro-points/badge-visibility";
import { redirect } from "next/navigation";
import { getStudentContext } from "@/lib/student/auth";
import { studentPortfolio } from "@/lib/student-portfolio/repository";
import { studentPublicSettings } from "@/lib/student-public-profile/repository";
import { StudentWorkspaceHeader } from "@/components/student/workspace-header";
import { StudentWorkspaceNav } from "@/components/student/workspace-nav";
import { StudentPublicProfileSettings } from "@/components/student/public-profile-settings";
import { PortfolioEditor } from "@/components/student/portfolio-editor";
import { PortfolioView } from "@/components/student/portfolio-view";
import { ProfileLayoutEditor } from "@/components/student/profile-layout";
import { getStudentReadinessEvidence } from "@/lib/student/learning-repository";
import type { StudentPortfolio, PortfolioEvidence } from "@/lib/student-portfolio/types";
import { SignOutButton } from "@/components/sign-out-button";
export const dynamic = "force-dynamic";
export default async function ProfileEditorPage() {
  const context = await getStudentContext(); if (!context) redirect("/dashboard");
  const [portfolio, settings, evidence, points] = await Promise.all([studentPortfolio(), studentPublicSettings(), getStudentReadinessEvidence(context.studentId), pointsSummary()]);
  const prefs = portfolio.preferences;
  const previewEvidence: PortfolioEvidence[] = [
    ...(prefs.showSkills ? evidence.verifiedSkills.map(e => ({ id: e.studentSkillId, title: e.name, category: "instructor_verified" as const, issuer: "Instructor verified", status: "verified", date: e.verifiedAt, expiresAt: null, version: null })) : []),
    ...(prefs.showTraining ? evidence.employerTraining.filter(e => e.status === "completed").map(e => ({ id: e.assignmentId, title: e.courseTitle, category: "employer_training" as const, issuer: e.employerName, status: "completed", date: e.completedAt, expiresAt: null, version: e.versionNumber })) : []),
    ...(prefs.showBadges ? evidence.companyBadges.map(e => ({ id: e.awardId, title: e.title, category: "company_badge" as const, issuer: e.employerName, status: e.status, date: e.issuedAt, expiresAt: e.expiresAt, version: e.versionNumber })) : []),
    ...(prefs.showCertifications ? evidence.employerCertifications.map(e => ({ id: e.credentialId, title: e.title, category: "employer_certification" as const, issuer: e.employerName, status: e.status, date: e.issuedAt, expiresAt: e.expiresAt, version: e.versionNumber })) : []),
  ];
  const publicFileIds = new Set(portfolio.files.filter(f => f.access === "public").map(f => f.id));
  const preview: StudentPortfolio = { ...portfolio, preferences: { ...prefs, photoId: prefs.photoId && publicFileIds.has(prefs.photoId) ? prefs.photoId : null, coverId: prefs.coverId && publicFileIds.has(prefs.coverId) ? prefs.coverId : null }, files: portfolio.files.filter(f => f.access === "public"), projects: portfolio.projects.filter(p => p.visibility === "public").map(p => ({ ...p, imageId: p.imageId && publicFileIds.has(p.imageId) ? p.imageId : null })), evidence: previewEvidence };

  return <><StudentWorkspaceHeader firstName={context.firstName} lastName={context.lastName} /><StudentWorkspaceNav active="profile" /><main className="page-wrap student-training-page"><div className="page-heading"><div><h1>Profile editor</h1><p className="card-sub">Choose what to share, arrange your panels, then return to your profile to edit projects and files.</p></div><Link className="button button-brand" href="/student/profile">Done · Back to profile</Link></div><StudentPublicProfileSettings initial={settings} suggestedName={[context.firstName, context.lastName].join(" ")} /><PortfolioEditor initial={portfolio} section="settings" /><SystemBadgeVisibility enabled={points.shareSystemBadges??false}/><section className="card"><h2>Layout & preview</h2><ProfileLayoutEditor preferences={portfolio.preferences} />{settings.visibility === "public" && settings.path ? <p><a className="button" href={settings.path} target="_blank" rel="noopener noreferrer">Preview public profile</a></p> : <p className="muted">Your profile is private. The preview below does not publish it. Public sections appear only after you choose Public and enable sharing.</p>}<h3>Public layout preview</h3><PortfolioView portfolio={preview} displayName={settings.displayName || context.firstName} headline={settings.headline} bio={settings.bio} headingLevel={2} publicView /></section><section className="card"><h2>Account</h2><SignOutButton /></section></main></>;
}
