import { Brand } from "@/components/brand";
import { ProductionWorkspace } from "@/components/concierge/production-workspace";
import { PageHeader, ButtonLink } from "@/components/design-system";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { listProductionRequests } from "@/lib/concierge";
import { getAccountContext } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminConciergePage() {
  const account = await getAccountContext();
  if (!account) redirect("/login");
  if (!account.memberships.some((m) =>
    m.status.toLowerCase() === "active" &&
    ["super_admin", "admin", "platform_admin"].includes(m.role.toLowerCase()) &&
    ["platform", "global", "system"].includes(m.scope_type.toLowerCase())
  )) redirect("/dashboard");
  const items = await listProductionRequests("admin");
  return <>
    <header className="topbar"><Brand />
      <div className="header-actions"><ThemeToggle /><SignOutButton /></div>
    </header>
    <main className="page-wrap">
      <PageHeader eyebrow="TXKPRO operations" title="Concierge production"
        description="Review field gaps, manage filming and editing, then hand off for Employer and Institution review."
        actions={<ButtonLink href="/admin">Administration</ButtonLink>} />
      <ProductionWorkspace view="admin" initial={items} />
    </main>
  </>;
}
