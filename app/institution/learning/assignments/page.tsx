import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { PageHeader, RoleViewBanner } from "@/components/design-system";
import { InstitutionAssignmentsTable } from "@/components/institution/learning/assignments-table";
import { InstitutionWorkspaceNav } from "@/components/institution/workspace-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  canManageInstitutionLearningAssignments,
  requireInstitutionContext,
} from "@/lib/institution/auth";
import { listInstitutionMicroCertAssignments } from "@/lib/institution/learning-repository";

export const dynamic = "force-dynamic";

type RouteContext = {
  searchParams: Promise<{ status?: string }>;
};

export default async function InstitutionAssignmentsPage({
  searchParams,
}: RouteContext) {
  const query = await searchParams;
  const context = await requireInstitutionContext();
  const status =
    query.status &&
    ["assigned", "in_progress", "completed", "cancelled"].includes(query.status)
      ? query.status
      : null;
  const assignments = await listInstitutionMicroCertAssignments(
    context,
    status,
  );
  const canManage = canManageInstitutionLearningAssignments(context);

  return (
    <>
      <header className="topbar institution-topbar">
        <Brand />
        <InstitutionWorkspaceNav
          active="assignments"
          institutionName={context.institutionName}
        />
        <div className="header-actions">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </header>

      <main className="page-wrap txk-prototype-content">
        <PageHeader
          eyebrow="Employer Training · Assignments"
          title="Assignment tracking"
          description="Track the canonical Student assignment lifecycle for Employer Micro-Certifications across your authorized Institution scope."
          actions={
            <Link
              className="txk-button txk-button-default txk-button-md"
              href="/institution/learning"
            >
              <ArrowLeftIcon aria-hidden="true" />
              Employer Training
            </Link>
          }
        />

        {!canManage ? (
          <RoleViewBanner title="Read-only assignment tracking">
            You can inspect assignment status and completion evidence in your
            authorized scope, but cannot create or cancel assignments.
          </RoleViewBanner>
        ) : null}

        <nav className="institution-assignment-filters" aria-label="Assignment status">
          {[
            ["", "All"],
            ["assigned", "Assigned"],
            ["in_progress", "In progress"],
            ["completed", "Completed"],
            ["cancelled", "Cancelled"],
          ].map(([value, label]) => (
            <Link
              key={value || "all"}
              href={
                value
                  ? `/institution/learning/assignments?status=${value}`
                  : "/institution/learning/assignments"
              }
              className={(status ?? "") === value ? "active" : ""}
            >
              {label}
            </Link>
          ))}
        </nav>

        <InstitutionAssignmentsTable
          assignments={assignments}
          institutionId={context.institutionId}
          canManage={canManage}
        />
      </main>
    </>
  );
}
