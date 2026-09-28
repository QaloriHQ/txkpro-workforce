import { Brand } from "@/components/brand";
import { InstitutionWorkspaceNav } from "@/components/institution/workspace-nav";
import { ProductionWorkspace } from "@/components/concierge/production-workspace";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { PageHeader } from "@/components/design-system";
import { canManageInstitutionLearningAssignments, requireInstitutionPageContext } from "@/lib/institution/auth";
import { getInstitutionEmployerLearningContext } from "@/lib/institution/learning-repository";
import { institutionScopeLabel, primaryInstitutionRole } from "@/lib/institution/presentation";
import { institutionProductionEmployers, listProductionRequests } from "@/lib/concierge";

export const dynamic = "force-dynamic";

export default async function InstitutionProductionPage() {
  const context = await requireInstitutionPageContext();
  const [items, learning, employers] = await Promise.all([
    listProductionRequests("institution"),
    getInstitutionEmployerLearningContext(context),
    institutionProductionEmployers(context),
  ]);
  const role = primaryInstitutionRole(context);
  return <>
    <header className="topbar institution-topbar">
      <Brand />
      <InstitutionWorkspaceNav active="learning" institutionName={context.institutionName}
        roleLabel={role.label} scopeLabel={institutionScopeLabel(context)} />
      <div className="header-actions"><ThemeToggle /><SignOutButton /></div>
    </header>
    <main className="page-wrap txk-prototype-content">
      <PageHeader eyebrow="Employer Training · Concierge" title="Production requests"
        description="Request and track employer-specific video training from a field gap through review and ready." />
      <ProductionWorkspace view="institution" canCreate={canManageInstitutionLearningAssignments(context)}
        initial={items} employers={employers}
        cohorts={learning.cohorts.filter((c) => c.canAssign).map((c) =>
          ({ id: c.cohortId, name: c.name, program: c.programName }))} />
    </main>
  </>;
}
