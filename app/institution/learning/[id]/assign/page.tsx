import { notFound } from "next/navigation";
import { Brand } from "@/components/brand";
import { PageHeader } from "@/components/design-system";
import { InstitutionAssignmentWizard } from "@/components/institution/learning/assignment-wizard";
import { InstitutionRoleContext } from "@/components/institution/role-context";
import { InstitutionWorkspaceNav } from "@/components/institution/workspace-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  canManageInstitutionLearningAssignments,
  requireInstitutionPageContext,
} from "@/lib/institution/auth";
import { getInstitutionEmployerLearningContext } from "@/lib/institution/learning-repository";
import { institutionAccess } from "@/lib/institution/policy";
import {
  institutionScopeLabel,
  primaryInstitutionRole,
} from "@/lib/institution/presentation";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

export default async function InstitutionAssignmentPage({
  params,
}: RouteContext) {
  const { id } = await params;
  const microCertId = decodeURIComponent(id);
  const context = await requireInstitutionPageContext({ capability: "assignments" });
  const learning = await getInstitutionEmployerLearningContext(context);
  const role = primaryInstitutionRole(context);
  const scopeLabel = institutionScopeLabel(context);
  const canManage = canManageInstitutionLearningAssignments(context);
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
          roleLabel={role.label}
          scopeLabel={scopeLabel}
          roles={context.roles}
          scopes={context.scopes}
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

        <InstitutionRoleContext
          roleLabel={role.label}
          scopeLabel={scopeLabel}
          accessLevel={institutionAccess(context, "assignments")}
        />

        <InstitutionAssignmentWizard
          learning={learning}
          course={course}
          canManage={canManage}
        />
      </main>
    </>
  );
}
