import {
  ArrowLeftIcon,
  BriefcaseIcon,
  CheckBadgeIcon,
  CheckCircleIcon,
  ClipboardDocumentCheckIcon,
  ShieldCheckIcon,
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
import { getInstitutionReferralDetail } from "@/lib/institution/learning-repository";
import { institutionAccess } from "@/lib/institution/policy";
import {
  institutionScopeLabel,
  primaryInstitutionRole,
} from "@/lib/institution/presentation";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function date(value: unknown) {
  return typeof value === "string" && value
    ? new Date(value).toLocaleDateString()
    : "—";
}

function yesNo(value: unknown) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (typeof value === "string" && value) return value;
  return "Not provided";
}

function pretty(value: string | null | undefined) {
  return value ? value.replaceAll("_", " ") : "—";
}

function statusTone(status: string | null | undefined) {
  if (status === "hired" || status === "active") return "success" as const;
  if (status === "closed" || status === "expired" || status === "ended") {
    return "danger" as const;
  }
  if (status === "delivered" || status === "pending_start") return "warning" as const;
  return "info" as const;
}

export default async function InstitutionReferralDetailPage({
  params,
}: RouteContext) {
  const { id } = await params;
  const context = await requireInstitutionPageContext({
    capability: "referrals",
  });
  const role = primaryInstitutionRole(context);
  const scopeLabel = institutionScopeLabel(context);

  let referral;
  try {
    referral = await getInstitutionReferralDetail(
      context,
      decodeURIComponent(id),
    );
  } catch (error) {
    if (error instanceof Response && error.status === 404) notFound();
    throw error;
  }

  const technical = objectValue(referral.technicalSnapshot);
  const operational = objectValue(referral.operationalSnapshot);
  const companyTrainingSnapshot = referral.companyTrainingSnapshot;
  const training = arrayValue(companyTrainingSnapshot?.training);
  const badges = arrayValue(companyTrainingSnapshot?.companyBadges);
  const certifications = arrayValue(
    companyTrainingSnapshot?.employerCertifications,
  );
  const verifiedSkills = arrayValue(technical.verifiedSkills);

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
          eyebrow="Institution Workspace · Referral detail"
          title={referral.studentName}
          description={`${referral.employerName ?? "Employer"} · ${referral.program ?? "Program"} · ${referral.hiringNeedTitle ?? "Direct referral"}`}
          actions={
            <ButtonLink href="/institution/referrals">
              <ArrowLeftIcon aria-hidden="true" />
              Referrals
            </ButtonLink>
          }
        />

        <InstitutionRoleContext
          roleLabel={role.label}
          scopeLabel={scopeLabel}
          accessLevel={institutionAccess(context, "referrals")}
        />

        <section className="txk-metric-grid institution-dashboard-metrics">
          <MetricCard
            label="Referral status"
            value={pretty(referral.status)}
            detail={`Updated ${date(referral.updatedAt)}`}
          />
          <MetricCard
            label="Student consent"
            value={pretty(referral.referralConsentStatus)}
            detail={pretty(referral.referralConsentSource)}
          />
          <MetricCard
            label="Interviews"
            value={referral.interviews.length}
            detail="Outcome visibility only"
          />
          <MetricCard
            label="Placements"
            value={referral.placements.length}
            detail="Canonical placement state"
          />
        </section>

        <div className="callout" style={{ marginBottom: 18 }}>
          <strong>Privacy boundary</strong>
          Employer-private candidate notes, interview messages, and evaluation
          summaries are intentionally excluded from this Institution view.
        </div>

        <section className="institution-student-profile-grid">
          <Card>
            <div className="txk-section-heading">
              <div>
                <p className="txk-eyebrow">Referral context</p>
                <h2>Policy-approved shared note</h2>
                <p>
                  Institution notes are employer-visible only when they pass the
                  D-09 policy check.
                </p>
              </div>
              <StatusBadge tone="info">
                {pretty(referral.referralNoteVisibility)}
              </StatusBadge>
            </div>
            {referral.institutionSharedNote ? (
              <p>{referral.institutionSharedNote}</p>
            ) : (
              <EmptyState title="No Institution-shared note" />
            )}
            <div className="readiness-list" style={{ marginTop: 16 }}>
              <div className="readiness-row">
                <span>Note policy</span>
                <strong>{pretty(referral.referralNotePolicy)}</strong>
              </div>
              <div className="readiness-row">
                <span>Consent checked</span>
                <strong>{date(referral.referralConsentCheckedAt)}</strong>
              </div>
              <div className="readiness-row">
                <span>Referred</span>
                <strong>{date(referral.referredAt)}</strong>
              </div>
            </div>
          </Card>

          <Card>
            <div className="txk-section-heading">
              <div>
                <p className="txk-eyebrow">Employer outcome visibility</p>
                <h2>Interviews and placements</h2>
                <p>
                  These are lifecycle consequences of canonical Employer
                  workflow records, not new Institution-owned hiring state.
                </p>
              </div>
            </div>
            <div className="institution-evidence-stack">
              {referral.interviews.map((interview) => (
                <div
                  className="institution-evidence-compact"
                  key={interview.interviewRequestId}
                >
                  <BriefcaseIcon aria-hidden="true" />
                  <span>
                    <strong>{interview.roleTitle ?? "Interview"}</strong>
                    <small>
                      {interview.employerName} · scheduled {date(interview.scheduledFor)}
                    </small>
                    <small>
                      Sent {date(interview.sentAt)} · responded{" "}
                      {date(interview.respondedAt)}
                    </small>
                  </span>
                  <StatusBadge tone={statusTone(interview.status)}>
                    {pretty(interview.status)}
                  </StatusBadge>
                </div>
              ))}
              {referral.placements.map((placement) => (
                <div
                  className="institution-evidence-compact"
                  key={placement.placementId}
                >
                  <ClipboardDocumentCheckIcon aria-hidden="true" />
                  <span>
                    <strong>{placement.roleTitle ?? "Placement"}</strong>
                    <small>
                      {placement.employerName} · hire date {date(placement.hireDate)}
                    </small>
                    <small>{pretty(placement.employmentType)}</small>
                  </span>
                  <StatusBadge tone={statusTone(placement.status)}>
                    {pretty(placement.status)}
                  </StatusBadge>
                </div>
              ))}
              {!referral.interviews.length && !referral.placements.length ? (
                <EmptyState title="No employer outcome yet" />
              ) : null}
            </div>
          </Card>
        </section>

        <section className="institution-student-profile-grid">
          <Card>
            <div className="txk-section-heading">
              <div>
                <p className="txk-eyebrow">Technical readiness</p>
                <h2>Verified Skills snapshot</h2>
                <p>
                  Instructor Verified Skills remain the authoritative technical
                  readiness evidence.
                </p>
              </div>
              <StatusBadge tone="success">
                {Number(technical.verifiedSkillCount ?? verifiedSkills.length)} verified
              </StatusBadge>
            </div>
            <div className="institution-evidence-stack">
              {verifiedSkills.map((rawSkill, index) => {
                const skill = objectValue(rawSkill);
                return (
                  <div className="institution-evidence-compact" key={String(skill.skillId ?? index)}>
                    <CheckCircleIcon aria-hidden="true" />
                    <span>
                      <strong>{String(skill.name ?? "Verified skill")}</strong>
                      <small>{String(skill.provenance ?? "institution_verified")}</small>
                    </span>
                    <StatusBadge tone="success">Verified</StatusBadge>
                  </div>
                );
              })}
              {!verifiedSkills.length ? (
                <EmptyState title="No verified skills in this snapshot" />
              ) : null}
            </div>
          </Card>

          <Card>
            <div className="txk-section-heading">
              <div>
                <p className="txk-eyebrow">Operational readiness</p>
                <h2>Readiness attestations</h2>
              </div>
            </div>
            <div className="readiness-list">
              <div className="readiness-row">
                <span>Driver’s license</span>
                <strong>{yesNo(operational.driversLicense)}</strong>
              </div>
              <div className="readiness-row">
                <span>Driving-record attestation</span>
                <strong>{yesNo(operational.drivingRecordAttestation)}</strong>
              </div>
              <div className="readiness-row">
                <span>Background-screen willingness</span>
                <strong>{yesNo(operational.backgroundScreenWillingness)}</strong>
              </div>
              <div className="readiness-row">
                <span>Drug-screen willingness</span>
                <strong>{yesNo(operational.drugScreenWillingness)}</strong>
              </div>
            </div>
          </Card>
        </section>

        <section className="txk-section">
          <Card>
            <div className="txk-section-heading">
              <div>
                <p className="txk-eyebrow">Company Training</p>
                <h2>Employer-specific snapshot</h2>
                <p>
                  Company Training, Company Badges, and Employer Certifications
                  are preserved separately from Verified Skills and are captured
                  as of referral creation.
                </p>
              </div>
              <ShieldCheckIcon aria-hidden="true" />
            </div>
            {companyTrainingSnapshot ? (
              <div className="grid grid-3 referral-company-training-groups">
                <div className="institution-evidence-stack">
                  <h3>Training</h3>
                  {training.map((raw, index) => {
                    const item = objectValue(raw);
                    return (
                      <div className="institution-evidence-compact" key={String(item.assignmentId ?? index)}>
                        <ClipboardDocumentCheckIcon aria-hidden="true" />
                        <span>
                          <strong>{String(item.courseTitle ?? "Company course")}</strong>
                          <small>
                            v{String(item.versionNumber ?? "—")} · {pretty(String(item.statusAtReferral ?? "assigned"))}
                          </small>
                        </span>
                      </div>
                    );
                  })}
                  {!training.length ? <EmptyState title="No training captured" /> : null}
                </div>
                <div className="institution-evidence-stack">
                  <h3>Company Badges</h3>
                  {badges.map((raw, index) => {
                    const item = objectValue(raw);
                    return (
                      <div className="institution-evidence-compact" key={String(item.awardId ?? index)}>
                        <CheckBadgeIcon aria-hidden="true" />
                        <span>
                          <strong>{String(item.badgeTitle ?? "Company Badge")}</strong>
                          <small>Issued {date(item.issuedAt)}</small>
                        </span>
                        <StatusBadge tone="info">
                          {pretty(String(item.statusAtReferral ?? "unknown"))}
                        </StatusBadge>
                      </div>
                    );
                  })}
                  {!badges.length ? <EmptyState title="No Company Badges captured" /> : null}
                </div>
                <div className="institution-evidence-stack">
                  <h3>Employer Certifications</h3>
                  {certifications.map((raw, index) => {
                    const item = objectValue(raw);
                    return (
                      <div className="institution-evidence-compact" key={String(item.credentialId ?? index)}>
                        <ShieldCheckIcon aria-hidden="true" />
                        <span>
                          <strong>{String(item.title ?? "Employer Certification")}</strong>
                          <small>Issued {date(item.issuedAt)}</small>
                        </span>
                        <StatusBadge tone="info">
                          {pretty(String(item.statusAtReferral ?? "unknown"))}
                        </StatusBadge>
                      </div>
                    );
                  })}
                  {!certifications.length ? <EmptyState title="No certifications captured" /> : null}
                </div>
              </div>
            ) : (
              <EmptyState title="No Company Training snapshot on this referral" />
            )}
          </Card>
        </section>
      </main>
    </>
  );
}
