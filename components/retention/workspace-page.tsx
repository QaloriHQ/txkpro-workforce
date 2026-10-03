import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { Card } from "@/components/design-system";
import { InstitutionWorkspaceNav } from "@/components/institution/workspace-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireInstitutionPageContext } from "@/lib/institution/auth";
import {
  institutionScopeLabel,
  primaryInstitutionRole,
} from "@/lib/institution/presentation";
import { getAccountContext } from "@/lib/auth";
import {
  getRetentionCase,
  listRetentionCases,
  RetentionError,
} from "@/lib/retention/repository";
import type {
  RetentionDetail,
  RetentionQueue,
  RetentionFilters,
} from "@/lib/retention/types";
import { RetentionCaseDetail } from "./detail";
import { RetentionCaseQueue } from "./queue";

export async function RetentionWorkspacePage({
  platform = false,
  caseId,
  filters = {},
}: {
  platform?: boolean;
  caseId?: string;
  filters?: RetentionFilters;
}) {
  const account = await getAccountContext();
  if (!account) redirect("/login");
  if (
    platform &&
    (account.userStatus !== "active" ||
      !account.memberships.some(
        (membership) =>
          membership.status.toLowerCase() === "active" &&
          membership.scope_type.toLowerCase() === "platform" &&
          ["super_admin", "admin", "platform_admin"].includes(
            membership.role.toLowerCase(),
          ),
      ))
  )
    notFound();
  const context = platform
    ? null
    : await requireInstitutionPageContext({ capability: "retention" });
  const basePath = platform ? "/admin/retention" : "/institution/retention";
  let item: RetentionDetail | undefined;
  let queue: RetentionQueue | undefined;
  let failure: string | undefined;
  const scopedFilters = { ...filters, institutionId: context?.institutionId };
  try {
    if (caseId) item = await getRetentionCase(caseId);
    else queue = await listRetentionCases(scopedFilters);
  } catch (error) {
    if (!(error instanceof RetentionError)) throw error;
    if (error.status === 401) redirect("/login");
    if (error.status === 403) notFound();
    failure = error.message;
  }
  if (item && context && item.institutionId !== context.institutionId)
    notFound();
  const content = item ? (
    <RetentionCaseDetail
      key={`${item.caseId}:${item.version}`}
      item={item}
      basePath={basePath}
    />
  ) : queue ? (
    <RetentionCaseQueue
      queue={queue}
      filters={scopedFilters}
      basePath={basePath}
    />
  ) : (
    <Card>
      <h1>Retention cases unavailable</h1>
      <p role="alert">{failure}</p>
      <Link href={basePath}>Return to cases</Link>
    </Card>
  );
  return (
    <>
      <header className="topbar institution-topbar">
        <Brand />
        {context ? (
          <InstitutionWorkspaceNav
            active="retention"
            institutionName={context.institutionName}
            roleLabel={primaryInstitutionRole(context).label}
            scopeLabel={institutionScopeLabel(context)}
            roles={context.roles}
            scopes={context.scopes}
          />
        ) : (
          <Link
            className="txk-button txk-button-ghost txk-button-md"
            href="/admin"
          >
            Platform administration
          </Link>
        )}
        <div className="header-actions">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </header>
      <main className="page-wrap txk-prototype-content retention-workspace">
        {content}
      </main>
    </>
  );
}
