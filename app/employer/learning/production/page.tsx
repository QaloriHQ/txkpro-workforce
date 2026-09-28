import { Brand } from "@/components/brand";
import { EmployerWorkspaceNav } from "@/components/employer/workspace-nav";
import { ProductionWorkspace } from "@/components/concierge/production-workspace";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { PageHeader } from "@/components/design-system";
import { canManageCompany, requireEmployerContext } from "@/lib/employer/auth";
import { listProductionRequests } from "@/lib/concierge";

export const dynamic = "force-dynamic";

export default async function EmployerProductionPage() {
  const context = await requireEmployerContext({ approved: true });
  const items = await listProductionRequests("employer");
  return <>
    <header className="topbar employer-topbar">
      <Brand /><EmployerWorkspaceNav active="learning" />
      <div className="header-actions"><ThemeToggle /><SignOutButton /></div>
    </header>
    <main className="page-wrap txk-prototype-content">
      <PageHeader eyebrow="Employer Learning · Concierge" title="Production requests"
        description="Request employer-specific training content and follow TXKPRO production progress." />
      <ProductionWorkspace view="employer" canCreate={canManageCompany(context.role)}
        initial={items} employers={[{ id: context.employerId, name: context.employerName }]} />
    </main>
  </>;
}
