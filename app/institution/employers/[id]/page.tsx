import { ConfirmStartForm } from "@/components/placements/confirm-start-form";
import {
  AcademicCapIcon,
  ArrowLeftIcon,
  BriefcaseIcon,
  BuildingOffice2Icon,
  CheckBadgeIcon,
  ClipboardDocumentCheckIcon,
  EyeIcon,
  PaperAirplaneIcon,
} from "@heroicons/react/24/outline";
import { notFound } from "next/navigation";
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
import { getInstitutionEmployerDetail } from "@/lib/institution/learning-repository";
import { institutionAccess } from "@/lib/institution/policy";
import {
  institutionScopeLabel,
  primaryInstitutionRole,
} from "@/lib/institution/presentation";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function pretty(value: string | null | undefined) {
  return value ? value.replaceAll("_", " ") : "Not provided";
}

function date(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString() : "Not provided";
}

function statusTone(value: string | null | undefined) {
  if (value === "active" || value === "approved" || value === "hired" || value === "resolved") {
    return "success" as const;
  }
  if (value === "open" || value === "assigned" || value === "contacted" || value === "monitoring") {
    return "warning" as const;
  }
  if (value === "closed" || value === "cancelled" || value === "rejected") {
    return "danger" as const;
  }
  return "info" as const;
}

function jsonList(values: unknown[]) {
  if (!values.length) return "Not specified";
  return values
    .map((value) => {
      if (typeof value === "string") return value;
      if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        return String(record.label ?? record.name ?? record.value ?? JSON.stringify(value));
      }
      return String(value);
    })
    .join(", ");
}

export default async function InstitutionEmployerDetailPage({
  params,
}: RouteContext) {
  const { id } = await params;
  const context = await requireInstitutionPageContext({
    capability: "employers",
  });
  const role = primaryInstitutionRole(context);
  const scopeLabel = institutionScopeLabel(context);

  let employer;
  try {
    employer = await getInstitutionEmployerDetail(
      context,
      decodeURIComponent(id),
    );
  } catch (error) {
    if (error instanceof Response && error.status === 404) notFound();
    throw error;
  }

  const openRetentionCases = employer.retention.cases.filter((item) =>
    ["open", "assigned", "contacted", "monitoring"].includes(item.status),
  ).length;

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
          eyebrow="Institution Workspace - Employer detail"
          title={employer.employerName}
          description={
            employer.city || employer.state
              ? `${employer.city ?? ""}${employer.city && employer.state ? ", " : ""}${employer.state ?? ""}`
              : "Approved Employer partner"
          }
          actions={
            <ButtonLink href="/institution/employers">
              <ArrowLeftIcon aria-hidden="true" />
              Employers
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
            label="Shared hiring needs"
            value={employer.hiringNeeds.length}
            detail="Employer-private needs excluded"
          />
          <MetricCard
            label="Employer Training"
            value={employer.microCerts.length}
            detail="Eligible ready/live micro-certs"
          />
          <MetricCard
            label="Referrals"
            value={employer.referrals.length}
            detail="Scoped Institution referrals"
          />
          <MetricCard
            label="Open retention cases"
            value={openRetentionCases}
            detail={`${employer.retention.milestones.length} milestones visible`}
          />
        </section>

        <div className="callout" style={{ marginBottom: 18 }}>
          <strong>Privacy boundary</strong>
          This Institution view excludes Employer-private candidate notes,
          interview messages, interview evaluations, raw retention responses,
          and retention case notes.
        </div>

        <section className="institution-student-profile-grid">
          <Card>
            <div className="txk-section-heading">
              <div>
                <p className="txk-eyebrow">Partner profile</p>
                <h2>Approved Employer information</h2>
              </div>
              <StatusBadge tone={statusTone(employer.approvalStatus)}>
                {pretty(employer.approvalStatus)}
              </StatusBadge>
            </div>
            <div className="readiness-list">
              <div className="readiness-row">
                <span>Workforce focus</span>
                <strong>{employer.workforceDescription ?? employer.description ?? "Not provided"}</strong>
              </div>
              <div className="readiness-row">
                <span>Trades</span>
                <strong>{jsonList(employer.tradeIds)}</strong>
              </div>
              <div className="readiness-row">
                <span>Hiring horizon</span>
                <strong>{pretty(employer.hiringHorizon)}</strong>
              </div>
              <div className="readiness-row">
                <span>Annual hiring volume</span>
                <strong>{employer.annualHiringVolume ?? "Not provided"}</strong>
              </div>
            </div>
          </Card>

          <Card>
            <div className="txk-section-heading">
              <div>
                <p className="txk-eyebrow">Authorized scope</p>
                <h2>Talent scope overlap</h2>
              </div>
            </div>
            <div className="institution-evidence-stack">
              {employer.talentScopes.map((scope) => (
                <div className="institution-evidence-compact" key={scope.talentScopeId}>
                  <BuildingOffice2Icon aria-hidden="true" />
                  <span>
                    <strong>{scope.cohortName ?? scope.programName ?? scope.tradeId ?? "Institution scope"}</strong>
                    <small>
                      {scope.cohortId ?? scope.programName ?? scope.tradeId ?? employer.employerId}
                    </small>
                  </span>
                  <StatusBadge tone="info">Active</StatusBadge>
                </div>
              ))}
              {!employer.talentScopes.length ? (
                <EmptyState title="No visible talent-scope rows" />
              ) : null}
            </div>
          </Card>
        </section>

        <section className="institution-student-profile-grid">
          <Card>
            <div className="txk-section-heading">
              <div>
                <p className="txk-eyebrow">Hiring needs</p>
                <h2>Institution-shared roles</h2>
              </div>
            </div>
            <div className="institution-evidence-stack">
              {employer.hiringNeeds.map((need) => (
                <div className="institution-evidence-compact" key={need.hiringNeedId}>
                  <BriefcaseIcon aria-hidden="true" />
                  <span>
                    <strong>{need.title}</strong>
                    <small>
                      {need.tradeId ?? "Trade"} - {need.targetHires} target hire
                      {need.targetHires === 1 ? "" : "s"}
                    </small>
                    <small>
                      Required skills: {jsonList(need.requiredVerifiedSkills)}
                    </small>
                  </span>
                  <StatusBadge tone={statusTone(need.status)}>
                    {pretty(need.status)}
                  </StatusBadge>
                </div>
              ))}
              {!employer.hiringNeeds.length ? (
                <EmptyState title="No shared hiring needs" />
              ) : null}
            </div>
          </Card>

          <Card>
            <div className="txk-section-heading">
              <div>
                <p className="txk-eyebrow">Employer Training</p>
                <h2>Eligible micro-certifications</h2>
              </div>
            </div>
            <div className="institution-evidence-stack">
              {employer.microCerts.map((course) => (
                <div className="institution-evidence-compact" key={course.microCertId}>
                  <AcademicCapIcon aria-hidden="true" />
                  <span>
                    <strong>{course.title}</strong>
                    <small>
                      v{course.versionNumber} - {course.eligibleStudentCount} eligible Student
                      {course.eligibleStudentCount === 1 ? "" : "s"}
                    </small>
                    <small>
                      {course.completedCount} completed of {course.assignmentCount} assigned
                    </small>
                  </span>
                  {course.companyBadge ? (
                    <StatusBadge tone="success">{course.companyBadge.title}</StatusBadge>
                  ) : (
                    <StatusBadge tone="info">{pretty(course.status)}</StatusBadge>
                  )}
                </div>
              ))}
              {!employer.microCerts.length ? (
                <EmptyState title="No eligible Employer Training" />
              ) : null}
            </div>
          </Card>
        </section>

        <section className="institution-student-profile-grid">
          <Card>
            <div className="txk-section-heading">
              <div>
                <p className="txk-eyebrow">Referral activity</p>
                <h2>Scoped referral lifecycle</h2>
              </div>
            </div>
            <div className="institution-evidence-stack">
              {employer.referrals.map((referral) => (
                <div className="institution-evidence-compact" key={referral.referralId}>
                  <PaperAirplaneIcon aria-hidden="true" />
                  <span>
                    <strong>{referral.studentName}</strong>
                    <small>
                      {referral.hiringNeedTitle ?? "Direct referral"} - {referral.program ?? "Program"}
                    </small>
                    <small>Referred {date(referral.referredAt)}</small>
                  </span>
                  <StatusBadge tone={statusTone(referral.status)}>
                    {pretty(referral.status)}
                  </StatusBadge>
                </div>
              ))}
              {!employer.referrals.length ? (
                <EmptyState title="No referrals for this Employer" />
              ) : null}
            </div>
          </Card>

          <Card>
            <div className="txk-section-heading">
              <div>
                <p className="txk-eyebrow">Placement outcomes</p>
                <h2>Canonical placement records</h2>
              </div>
            </div>
            <div className="institution-evidence-stack">
              {employer.placements.map((placement) => (
                <div className="institution-evidence-compact" key={placement.placementId}>
                  <ClipboardDocumentCheckIcon aria-hidden="true" />
                  <span>
                    <strong>{placement.studentName}</strong>
                    <small>
                      {placement.roleTitle ?? "Placement"} - hire date {date(placement.hireDate)}
                    </small>
                    <small>{pretty(placement.employmentType)}</small>
                  </span>
                  <StatusBadge tone={statusTone(placement.status)}>
                    {pretty(placement.status)}
                  </StatusBadge>
                  <small>{placement.officialPlacement ? `Employment started ${placement.employmentStartDate}` : "Start confirmation required"}</small>
                  {placement.canConfirmStart && !placement.startConfirmedAt ? <ConfirmStartForm placementId={placement.placementId} scheduledStartDate={placement.hireDate} /> : null}
                </div>
              ))}
              {!employer.placements.length ? (
                <EmptyState title="No placements for this Employer" />
              ) : null}
            </div>
          </Card>
        </section>

        <section className="institution-student-profile-grid">
          <Card>
            <div className="txk-section-heading">
              <div>
                <p className="txk-eyebrow">Retention</p>
                <h2>Milestones and case summaries</h2>
                <p>
                  Retention is shown as policy-approved outcome status only.
                </p>
              </div>
            </div>
            <div className="institution-evidence-stack">
              {employer.retention.cases.map((retentionCase) => (
                <div className="institution-evidence-compact" key={retentionCase.caseId}>
                  <CheckBadgeIcon aria-hidden="true" />
                  <span>
                    <strong>{pretty(retentionCase.severity)} case</strong>
                    <small>{retentionCase.summary ?? "Retention follow-up case"}</small>
                    <small>Opened {date(retentionCase.openedAt)}</small>
                  </span>
                  <StatusBadge tone={statusTone(retentionCase.status)}>
                    {pretty(retentionCase.status)}
                  </StatusBadge>
                </div>
              ))}
              {!employer.retention.cases.length ? (
                <EmptyState title="No retention cases for this Employer" />
              ) : null}
            </div>
          </Card>

          <Card>
            <div className="txk-section-heading">
              <div>
                <p className="txk-eyebrow">Employer exposure</p>
                <h2>Recent exposure events</h2>
              </div>
            </div>
            <div className="institution-evidence-stack">
              {employer.exposure.slice(0, 12).map((event) => (
                <div className="institution-evidence-compact" key={event.exposureEventId}>
                  <EyeIcon aria-hidden="true" />
                  <span>
                    <strong>{pretty(event.eventType)}</strong>
                    <small>
                      {pretty(event.sourceType)} - {date(event.occurredAt)}
                    </small>
                  </span>
                  <StatusBadge tone="info">Read model</StatusBadge>
                </div>
              ))}
              {!employer.exposure.length ? (
                <EmptyState title="No exposure events for this Employer" />
              ) : null}
            </div>
          </Card>
        </section>
      </main>
    </>
  );
}
