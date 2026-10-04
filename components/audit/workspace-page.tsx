import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { Card } from "@/components/design-system";
import { InstitutionWorkspaceNav } from "@/components/institution/workspace-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { getAccountContext } from "@/lib/auth";
import { requireInstitutionPageContext } from "@/lib/institution/auth";
import { institutionScopeLabel, primaryInstitutionRole } from "@/lib/institution/presentation";
import { AuditError, auditQuery } from "@/lib/audit-workspace/repository";
import type { AuditFilters } from "@/lib/audit-workspace/types";
import { AuditWorkspace } from "./workspace";

export async function AuditWorkspacePage({ platform = false, filters }: { platform?: boolean; filters: AuditFilters }) {
  const account = await getAccountContext();
  if (!account) redirect("/login");
  if (platform && (account.userStatus.toLowerCase() !== "active" || !account.memberships.some(m =>
    m.status.toLowerCase() === "active" && m.scope_type.toLowerCase() === "platform" &&
    ["super_admin", "admin", "platform_admin"].includes(m.role.toLowerCase())))) notFound();
  const context = platform ? null : await requireInstitutionPageContext({ institutionId: filters.institutionId, capability: "audit" });
  const scoped = { ...filters, institutionId: context?.institutionId ?? filters.institutionId };
  const basePath = platform ? "/admin/audit" : "/institution/audit";
  let queue;
  let failure;
  try { queue = await auditQuery(scoped); }
  catch (error) {
    if (!(error instanceof AuditError)) throw error;
    if (error.status === 401) redirect("/login");
    if (error.status === 403) notFound();
    failure = error.message;
  }
  const content = queue ? <AuditWorkspace queue={queue} filters={scoped} basePath={basePath} />
    : <Card><h1>Audit history unavailable</h1><p role="alert">{failure}</p><Link href={basePath}>Clear filters and retry</Link></Card>;
  return <>
    <header className="topbar institution-topbar"><Brand />
      {context ? <InstitutionWorkspaceNav active="audit" institutionName={context.institutionName}
        roleLabel={primaryInstitutionRole(context).label} scopeLabel={institutionScopeLabel(context)} roles={context.roles} scopes={context.scopes} />
        : <Link className="txk-button txk-button-ghost" href="/admin">Platform administration</Link>}
      <div className="header-actions"><ThemeToggle /><SignOutButton /></div>
    </header>
    <main className="page-wrap txk-prototype-content audit-workspace">{content}</main>
  </>;
}
