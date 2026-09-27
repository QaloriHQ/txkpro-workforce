import {
  ArrowLeftIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { Brand } from "@/components/brand";
import {
  ButtonLink,
  PageHeader,
  StatusBadge,
} from "@/components/design-system";
import { InstitutionAssignmentsTable } from "@/components/institution/learning/assignments-table";
import { InstitutionRoleContext } from "@/components/institution/role-context";
import { InstitutionWorkspaceNav } from "@/components/institution/workspace-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  canManageInstitutionLearningAssignments,
  requireInstitutionContext,
} from "@/lib/institution/auth";
import {
  listInstitutionCompanyBadgeEvidence,
  listInstitutionMicroCertAssignments,
} from "@/lib/institution/learning-repository";
import {
  institutionScopeLabel,
  primaryInstitutionRole,
} from "@/lib/institution/presentation";
import type { InstitutionAssignmentFilters } from "@/lib/institution/types";

export const dynamic = "force-dynamic";

type RouteContext = {
  searchParams: Promise<{
    status?: string;
    q?: string;
    student?: string;
    employer?: string;
    course?: string;
    program?: string;
    cohort?: string;
    badge?: string;
  }>;
};

function uniqueOptions(
  values: Array<{ value: string | null; label: string | null }>,
) {
  const map = new Map<string, string>();
  for (const item of values) {
    if (item.value && item.label) map.set(item.value, item.label);
  }
  return [...map.entries()].map(([value, label]) => ({ value, label }));
}

export default async function InstitutionAssignmentsPage({
  searchParams,
}: RouteContext) {
  const query = await searchParams;
  const context = await requireInstitutionContext();
  const canManage = canManageInstitutionLearningAssignments(context);
  const role = primaryInstitutionRole(context);
  const scopeLabel = institutionScopeLabel(context);

  const status =
    query.status &&
    ["assigned", "in_progress", "completed", "cancelled"].includes(query.status)
      ? query.status
      : null;

  const filters: InstitutionAssignmentFilters = {
    status,
    query: query.q?.trim() || null,
    studentId: query.student || null,
    employerId: query.employer || null,
    microCertId: query.course || null,
    programName: query.program || null,
    cohortId: query.cohort || null,
    companyBadgeId: query.badge || null,
  };

  const [assignments, allAssignments, badges] = await Promise.all([
    listInstitutionMicroCertAssignments(context, filters),
    listInstitutionMicroCertAssignments(context),
    listInstitutionCompanyBadgeEvidence(context),
  ]);

  const students = uniqueOptions(
    allAssignments.map((item) => ({
      value: item.studentId,
      label: item.studentName,
    })),
  );
  const employers = uniqueOptions(
    allAssignments.map((item) => ({
      value: item.employerId,
      label: item.employerName,
    })),
  );
  const courses = uniqueOptions(
    allAssignments.map((item) => ({
      value: item.microCertId,
      label: item.courseTitle,
    })),
  );
  const programs = uniqueOptions(
    allAssignments.map((item) => ({
      value: item.programName,
      label: item.programName,
    })),
  );
  const cohorts = uniqueOptions(
    allAssignments.map((item) => ({
      value: item.cohortId,
      label: item.cohortName,
    })),
  );

  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const statusCounts = {
    all: allAssignments.length,
    assigned: allAssignments.filter((item) => item.status === "assigned").length,
    in_progress: allAssignments.filter(
      (item) => item.status === "in_progress",
    ).length,
    completed: allAssignments.filter(
      (item) => item.status === "completed",
    ).length,
    cancelled: allAssignments.filter(
      (item) => item.status === "cancelled",
    ).length,
  };

  return (
    <>
      <header className="topbar institution-topbar">
        <Brand />
        <InstitutionWorkspaceNav
          active="assignments"
          institutionName={context.institutionName}
          roleLabel={role.label}
          scopeLabel={scopeLabel}
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
          description="Track Student Employer Training from assignment through explainable completion evidence and Company Badge outcomes across your authorized Institution scope."
          actions={
            <ButtonLink href="/institution/learning">
              <ArrowLeftIcon aria-hidden="true" />
              Employer Training
            </ButtonLink>
          }
        />

        <InstitutionRoleContext
          roleLabel={role.label}
          scopeLabel={scopeLabel}
          canManage={canManage}
        />

        <nav className="institution-assignment-filters" aria-label="Assignment status">
          {[
            ["", "All", statusCounts.all],
            ["assigned", "Not started", statusCounts.assigned],
            ["in_progress", "In progress", statusCounts.in_progress],
            ["completed", "Completed", statusCounts.completed],
            ["cancelled", "Cancelled", statusCounts.cancelled],
          ].map(([value, label, count]) => {
            const params = new URLSearchParams();
            if (value) params.set("status", String(value));
            return (
              <Link
                key={String(value) || "all"}
                href={
                  params.size
                    ? `/institution/learning/assignments?${params.toString()}`
                    : "/institution/learning/assignments"
                }
                className={(status ?? "") === value ? "active" : ""}
              >
                {label}
                <strong>{count}</strong>
              </Link>
            );
          })}
        </nav>

        <details
          className="institution-assignment-filter-panel"
          open={activeFilterCount > (status ? 1 : 0)}
        >
          <summary>
            <FunnelIcon aria-hidden="true" />
            Filters
            {activeFilterCount ? (
              <StatusBadge tone="info">{activeFilterCount} active</StatusBadge>
            ) : null}
          </summary>
          <form className="institution-assignment-filter-form" method="get">
            <label className="institution-filter-search">
              <span>Search</span>
              <div>
                <MagnifyingGlassIcon aria-hidden="true" />
                <input
                  type="search"
                  name="q"
                  defaultValue={query.q ?? ""}
                  placeholder="Student, course, Employer, Program"
                />
              </div>
            </label>

            <label>
              <span>Status</span>
              <select name="status" defaultValue={status ?? ""}>
                <option value="">All statuses</option>
                <option value="assigned">Not started</option>
                <option value="in_progress">In progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>

            <label>
              <span>Student</span>
              <select name="student" defaultValue={query.student ?? ""}>
                <option value="">All Students</option>
                {students.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Employer</span>
              <select name="employer" defaultValue={query.employer ?? ""}>
                <option value="">All Employers</option>
                {employers.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Course</span>
              <select name="course" defaultValue={query.course ?? ""}>
                <option value="">All courses</option>
                {courses.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Program</span>
              <select name="program" defaultValue={query.program ?? ""}>
                <option value="">All Programs</option>
                {programs.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Cohort</span>
              <select name="cohort" defaultValue={query.cohort ?? ""}>
                <option value="">All Cohorts</option>
                {cohorts.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Company Badge</span>
              <select name="badge" defaultValue={query.badge ?? ""}>
                <option value="">All Company Badges</option>
                {badges.map((badge) => (
                  <option key={badge.companyBadgeId} value={badge.companyBadgeId}>
                    {badge.title} · {badge.employerName}
                  </option>
                ))}
              </select>
            </label>

            <div className="institution-filter-actions">
              <button
                className="txk-button txk-button-primary txk-button-md"
                type="submit"
              >
                Apply filters
              </button>
              <Link
                className="txk-button txk-button-default txk-button-md"
                href="/institution/learning/assignments"
              >
                Clear
              </Link>
            </div>
          </form>
        </details>

        <div className="institution-assignment-result-summary">
          <span>
            Showing <strong>{assignments.length}</strong> of{" "}
            <strong>{allAssignments.length}</strong> assignments
          </span>
          <span>
            Canonical lifecycle: Not started → In progress → Completed
          </span>
        </div>

        <InstitutionAssignmentsTable
          assignments={assignments}
          institutionId={context.institutionId}
          canManage={canManage}
        />
      </main>
    </>
  );
}
