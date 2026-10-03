import {
  ArrowRightIcon,
  BriefcaseIcon,
  PaperAirplaneIcon,
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
import { InstitutionReferralCreateForm } from "@/components/institution/referral-create-form";
import { InstitutionRoleContext } from "@/components/institution/role-context";
import { InstitutionWorkspaceNav } from "@/components/institution/workspace-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireInstitutionPageContext } from "@/lib/institution/auth";
import {
  getInstitutionReferralCreateContext,
  listInstitutionReferrals,
} from "@/lib/institution/learning-repository";
import {
  institutionAccess,
  institutionCanManage,
} from "@/lib/institution/policy";
import {
  institutionScopeLabel,
  primaryInstitutionRole,
} from "@/lib/institution/presentation";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function pretty(value: string | null | undefined) {
  return value ? value.replaceAll("_", " ") : "—";
}

function statusTone(status: string | null | undefined) {
  if (status === "hired") return "success" as const;
  if (status === "closed" || status === "expired" || status === "interview_declined") {
    return "danger" as const;
  }
  if (status === "delivered" || status === "referred") return "warning" as const;
  return "info" as const;
}

export default async function InstitutionReferralsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const context = await requireInstitutionPageContext({
    capability: "referrals",
  });
  const params = await searchParams;
  const status = one(params.status) ?? null;
  const studentId = one(params.studentId) ?? null;
  const [referrals, createContext] = await Promise.all([
    listInstitutionReferrals(context, { status, studentId }),
    getInstitutionReferralCreateContext(context),
  ]);
  const role = primaryInstitutionRole(context);
  const scopeLabel = institutionScopeLabel(context);
  const canCreate = institutionCanManage(context, "referrals");
  const openCount = referrals.filter((referral) =>
    ["delivered", "viewed", "interview_requested", "interview_accepted"].includes(
      referral.status,
    ),
  ).length;
  const outcomeCount = referrals.filter((referral) =>
    ["hired", "closed"].includes(referral.status),
  ).length;
  const consentReady = createContext.students.filter(
    (student) => student.referralConsent.allowed,
  ).length;

  return (
    <>
      <header className="topbar institution-topbar">
        <Brand />
        <InstitutionWorkspaceNav
          active="referrals"
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
          eyebrow="Institution Workspace · Referrals"
          title="Referral workspace"
          description="Create and monitor Student referrals using scoped Institution authority, student visibility consent, and shared outcome signals without exposing Employer-private hiring notes."
          actions={
            <ButtonLink href="/institution">
              <BriefcaseIcon aria-hidden="true" />
              Dashboard
            </ButtonLink>
          }
        />

        <InstitutionRoleContext
          roleLabel={role.label}
          scopeLabel={scopeLabel}
          accessLevel={institutionAccess(context, "referrals")}
        />

        <section className="txk-metric-grid institution-dashboard-metrics">
          <MetricCard label="Referrals" value={referrals.length} detail="Current filter" />
          <MetricCard label="Open" value={openCount} detail="Delivered through interview" />
          <MetricCard label="Outcomes" value={outcomeCount} detail="Hired or closed" />
          <MetricCard
            label="Consent-ready Students"
            value={consentReady}
            detail={`${createContext.students.length} in authorized scope`}
          />
        </section>

        <section className="institution-student-profile-grid">
          <InstitutionReferralCreateForm
            institutionId={context.institutionId}
            students={createContext.students}
            employers={createContext.employers}
            hiringNeeds={createContext.hiringNeeds}
            canCreate={canCreate}
          />

          <Card>
            <div className="txk-section-heading">
              <div>
                <p className="txk-eyebrow">Queue</p>
                <h2>Monitor referral lifecycle</h2>
                <p>
                  Employer interview and placement statuses are visible as
                  workflow outcomes; private evaluations remain Employer-only.
                </p>
              </div>
            </div>

            <div className="choice-row" style={{ marginBottom: 18 }}>
              {[
                ["", "All"],
                ["delivered", "Delivered"],
                ["viewed", "Viewed"],
                ["interview_requested", "Interview"],
                ["hired", "Hired"],
                ["closed", "Closed"],
              ].map(([value, label]) => (
                <Link
                  key={value}
                  className={`choice-pill ${(status ?? "") === value ? "selected" : ""}`}
                  href={
                    value
                      ? `/institution/referrals?status=${value}`
                      : "/institution/referrals"
                  }
                >
                  {label}
                </Link>
              ))}
            </div>

            {referrals.length ? (
              <div className="institution-evidence-stack">
                {referrals.map((referral) => (
                  <article
                    className="institution-evidence-compact"
                    key={referral.referralId}
                  >
                    <PaperAirplaneIcon aria-hidden="true" />
                    <span>
                      <strong>{referral.studentName}</strong>
                      <small>
                        {referral.employerName ?? "Employer"} ·{" "}
                        {referral.hiringNeedTitle ?? "Direct referral"}
                      </small>
                      <small>
                        {referral.program ?? "Program"} · referred{" "}
                        {referral.referredAt
                          ? new Date(referral.referredAt).toLocaleDateString()
                          : "—"}
                      </small>
                      {referral.latestInterviewStatus || referral.placementStatus ? (
                        <small>
                          Outcome: interview {pretty(referral.latestInterviewStatus)} ·
                          placement {pretty(referral.placementStatus)}
                        </small>
                      ) : null}
                    </span>
                    <StatusBadge tone={statusTone(referral.status)}>
                      {pretty(referral.status)}
                    </StatusBadge>
                    <Link
                      className="txk-icon-button"
                      aria-label={`Open referral ${referral.referralId}`}
                      href={`/institution/referrals/${encodeURIComponent(referral.referralId)}`}
                    >
                      <ArrowRightIcon aria-hidden="true" />
                    </Link>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No referrals in this view"
                description="Create a referral or choose a different status filter."
              />
            )}
          </Card>
        </section>
      </main>
    </>
  );
}
