import {
  ArrowRightIcon,
  BriefcaseIcon,
  BuildingOffice2Icon,
  CheckBadgeIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { Brand } from "@/components/brand";
import {
  ButtonLink,
  Card,
  EmptyState,
  MetricCard,
  PageHeader,
  StatusBadge,
} from "@/components/design-system";
import { InstitutionRoleContext } from "@/components/institution/role-context";
import { InstitutionWorkspaceNav } from "@/components/institution/workspace-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireInstitutionPageContext } from "@/lib/institution/auth";
import { listInstitutionEmployers } from "@/lib/institution/learning-repository";
import { institutionAccess } from "@/lib/institution/policy";
import {
  institutionScopeLabel,
  primaryInstitutionRole,
} from "@/lib/institution/presentation";

export const dynamic = "force-dynamic";

function pretty(value: string | null | undefined) {
  return value ? value.replaceAll("_", " ") : "Not provided";
}

function date(value: string | null | undefined) {
  return value && !value.startsWith("1970")
    ? new Date(value).toLocaleDateString()
    : "No activity yet";
}

export default async function InstitutionEmployersPage() {
  const context = await requireInstitutionPageContext({
    capability: "employers",
  });
  const employers = await listInstitutionEmployers(context);
  const role = primaryInstitutionRole(context);
  const scopeLabel = institutionScopeLabel(context);
  const hiringNeeds = employers.reduce(
    (total, employer) => total + employer.hiringNeedCount,
    0,
  );
  const microCerts = employers.reduce(
    (total, employer) => total + employer.microCertCount,
    0,
  );
  const activePlacements = employers.reduce(
    (total, employer) => total + employer.activePlacementCount,
    0,
  );

  return (
    <>
      <header className="topbar institution-topbar">
        <Brand />
        <InstitutionWorkspaceNav
          active="employers"
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
          eyebrow="Institution Workspace - Employers"
          title="Employer directory"
          description="Review approved Employer partners, shared hiring needs, Employer Training, referrals, placements, and retention outcomes inside your authorized Institution scope."
          actions={
            <ButtonLink href="/institution/referrals">
              <BriefcaseIcon aria-hidden="true" />
              Referrals
            </ButtonLink>
          }
        />

        <InstitutionRoleContext
          roleLabel={role.label}
          scopeLabel={scopeLabel}
          accessLevel={institutionAccess(context, "employers")}
        />

        <section className="txk-metric-grid institution-dashboard-metrics">
          <MetricCard
            label="Approved partners"
            value={employers.length}
            detail="In authorized talent scope"
          />
          <MetricCard
            label="Shared hiring needs"
            value={hiringNeeds}
            detail="Employer-private needs excluded"
          />
          <MetricCard
            label="Employer Training"
            value={microCerts}
            detail="Ready or live micro-certs"
          />
          <MetricCard
            label="Active placements"
            value={activePlacements}
            detail="Scoped outcome records"
          />
        </section>

        <section className="txk-section">
          <div className="txk-section-heading">
            <div>
              <p className="txk-eyebrow">Approved partners</p>
              <h2>Employer activity in scope</h2>
              <p>
                Counts are derived from canonical workflows. Employer-private
                interview notes and evaluations are not part of this view.
              </p>
            </div>
          </div>

          {employers.length ? (
            <div className="institution-program-grid">
              {employers.map((employer) => (
                <Card key={employer.employerId}>
                  <BuildingOffice2Icon aria-hidden="true" />
                  <div>
                    <h3>{employer.employerName}</h3>
                    <p>
                      {employer.city || employer.state
                        ? `${employer.city ?? ""}${employer.city && employer.state ? ", " : ""}${employer.state ?? ""}`
                        : "Approved Employer partner"}
                    </p>
                    <p>
                      {employer.hiringNeedCount} hiring need
                      {employer.hiringNeedCount === 1 ? "" : "s"} -{" "}
                      {employer.microCertCount} micro-cert
                      {employer.microCertCount === 1 ? "" : "s"} -{" "}
                      {employer.referralCount} referral
                      {employer.referralCount === 1 ? "" : "s"}
                    </p>
                    <p>Last activity: {date(employer.lastActivityAt)}</p>
                  </div>
                  <StatusBadge tone="success">
                    {pretty(employer.approvalStatus)}
                  </StatusBadge>
                  <Link
                    className="txk-icon-button"
                    aria-label={`Open ${employer.employerName}`}
                    href={`/institution/employers/${encodeURIComponent(employer.employerId)}`}
                  >
                    <ArrowRightIcon aria-hidden="true" />
                  </Link>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No Employers in this Institution scope"
              description="Approved Employers appear here when active talent scopes, shared hiring needs, Employer Training, referrals, or outcomes overlap your authorized programs or cohorts."
            />
          )}
        </section>

        <section className="institution-readiness-category-grid">
          <Card>
            <CheckBadgeIcon aria-hidden="true" />
            <div>
              <h3>Evidence remains separated</h3>
              <p>
                Verified Skills, Employer Training, referrals, and placements
                are shown as distinct evidence classes, not a combined score.
              </p>
            </div>
          </Card>
          <Card>
            <BriefcaseIcon aria-hidden="true" />
            <div>
              <h3>Outcome visibility</h3>
              <p>
                Institution users can monitor scoped referral, placement, and
                retention state without receiving Employer-private hiring data.
              </p>
            </div>
          </Card>
        </section>
      </main>
    </>
  );
}
