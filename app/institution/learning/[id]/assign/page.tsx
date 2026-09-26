import { notFound } from "next/navigation";
import { Brand } from "@/components/brand";
import { PageHeader } from "@/components/design-system";
import { InstitutionAssignmentWizard } from "@/components/institution/learning/assignment-wizard";
import { InstitutionWorkspaceNav } from "@/components/institution/workspace-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  canManageInstitutionLearningAssignments,
  requireInstitutionContext,
} from "@/lib/institution/auth";
import { getInstitutionEmployerLearningContext } from "@/lib/institution/learning-repository";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

export default async function InstitutionAssignmentPage({
  params,
}: RouteContext) {
  const { id } = await params;
  const microCertId = decodeURIComponent(id);
  const context = await requireInstitutionContext();
  const learning = await getInstitutionEmployerLearningContext(context);
  const course = learning.courses.find(
    (item) => item.microCertId === microCertId,
  );
  if (!course) notFound();

  return (
    <>
      <header className="topbar institution-topbar">
        <Brand />
        <InstitutionWorkspaceNav
          active="learning"
          institutionName={context.institutionName}
        />
        <div className="header-actions">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </header>

      <main className="page-wrap txk-prototype-content">
        <PageHeader
          eyebrow="Employer Training · Assignment"
          title={course.title}
          description="Select the authorized Program, Cohort, or Students; review eligibility and existing assignments; then create canonical per-Student assignment records."
        />

        <InstitutionAssignmentWizard
          learning={learning}
          course={course}
          canManage={canManageInstitutionLearningAssignments(context)}
        />
      </main>
    </>
  );
}
