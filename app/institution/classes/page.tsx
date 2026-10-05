import Link from "next/link";
import { Brand } from "@/components/brand";
import { PageHeader } from "@/components/design-system";
import { InstitutionWorkspaceNav } from "@/components/institution/workspace-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { ClassesWorkspace } from "@/components/classes/workspace";
import type { DirectoryData } from "@/components/classes/directory";
import { requireInstitutionPageContext } from "@/lib/institution/auth";
import { institutionScopeLabel, primaryInstitutionRole } from "@/lib/institution/presentation";
import { classRpc, type ClassWorkspace } from "@/lib/classes/server";

export const dynamic = "force-dynamic";
export default async function Classes({ searchParams }: { searchParams: Promise<{ offset?: string }> }) {
  const { offset } = await searchParams;
  const pageOffset = Math.max(0, Math.min(100000, Math.trunc(Number(offset) || 0)));
  const context = await requireInstitutionPageContext({ capability: "students" });
  const [data, directory] = await Promise.all([
    classRpc<ClassWorkspace>("class_workspace", { p_offset: pageOffset }),
    classRpc<DirectoryData>("institution_connections"),
  ]);
  const role = primaryInstitutionRole(context);
  return <>
    <header className="topbar institution-topbar">
      <Brand />
      <InstitutionWorkspaceNav active="classes" institutionName={context.institutionName} roleLabel={role.label}
        scopeLabel={institutionScopeLabel(context)} roles={context.roles} scopes={context.scopes} />
      <div className="header-actions"><ThemeToggle /><SignOutButton /></div>
    </header>
    <main className="page-wrap txk-prototype-content classes-page">
      <PageHeader eyebrow="Institution workspace" title="Classes & rosters"
        description="Manage classes across cohorts, invite students and track accepted enrollments." />
      <ClassesWorkspace data={data} people={directory.people} />
      <nav aria-label="Class pages" className="institution-action-bar">
        {data.offset > 0 ? <Link className="button" href={`/institution/classes?offset=${Math.max(0, data.offset - 20)}`}>Previous classes</Link> : null}
        {data.hasMore ? <Link className="button" href={`/institution/classes?offset=${data.offset + 20}`}>Next classes</Link> : null}
      </nav>
    </main>
  </>;
}
