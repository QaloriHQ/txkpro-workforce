import { ConfirmStartForm } from "@/components/placements/confirm-start-form";
import {
  AcademicCapIcon,
  ArrowLeftIcon,
  BriefcaseIcon,
  CheckBadgeIcon,
  CheckCircleIcon,
  DocumentCheckIcon,
  UserGroupIcon,
  WrenchScrewdriverIcon,
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
import { getInstitutionStudentProfile } from "@/lib/institution/learning-repository";
import { institutionAccess } from "@/lib/institution/policy";
import {
  institutionScopeLabel,
  primaryInstitutionRole,
} from "@/lib/institution/presentation";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ studentId: string }>;
};

export default async function InstitutionStudentProfilePage({
  params,
}: RouteContext) {
  const { studentId } = await params;
  const context = await requireInstitutionPageContext({ capability: "students" });
  const role = primaryInstitutionRole(context);
  const scopeLabel = institutionScopeLabel(context);

  let profile;
  try {
    profile = await getInstitutionStudentProfile(
      context,
      decodeURIComponent(studentId),
    );
  } catch (error) {
    if (error instanceof Response && error.status === 404) notFound();
    throw error;
  }

  const evidence = profile.readinessEvidence;
  const verifiedSkills = profile.technicalSkills.filter(
    (skill) => skill.evidenceClass === "verified",
  );
  const selfAttestedSkills = profile.technicalSkills.filter(
    (skill) => skill.evidenceClass === "self_attested",
  );
  const inProgressSkills = profile.technicalSkills.filter(
    (skill) => skill.evidenceClass === "in_progress",
  );
  const activeBadges = evidence.companyBadges.filter(
    (badge) => badge.status === "active",
  ).length;
  const completedTraining = profile.employerTraining.filter(
    (assignment) => assignment.status === "completed",
  ).length;
  const activeInterview = profile.interviews.find((item) =>
    ["sent", "accepted", "scheduled"].includes(item.status),
  );
  const activePlacement = profile.placements.find(
    (item) => item.status === "active" && item.officialPlacement,
  );
  const openRetentionCases = profile.retention.cases.filter((item) =>
    ["open", "assigned", "contacted", "monitoring"].includes(item.status),
  );

  return (
    <>
      <header className="topbar institution-topbar">
        <Brand />
        <InstitutionWorkspaceNav
          active="students"
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
        <Link className="button" href="/institution/directory">Institution directory</Link>
        <PageHeader
          eyebrow="Students · Readiness profile"
          title={profile.student.displayName}
          description={
            <>
              {profile.student.programName ?? "Program"} ·{" "}
              {profile.student.cohortName ?? "Cohort"}
            </>
          }
          actions={
            <ButtonLink href="/institution/students">
              <ArrowLeftIcon aria-hidden="true" />
              Students
            </ButtonLink>
          }
        />

        <InstitutionRoleContext
          roleLabel={role.label}
          scopeLabel={scopeLabel}
          accessLevel={institutionAccess(context, "students")}
        />

        <Card className="institution-learning-connection">
          <div>
            <p className="txk-eyebrow">Identity and membership</p>
            <h2>Canonical Student profile</h2>
            <p>
              Accepted Student invitations resolve to this profile and linked
              user membership. Pending invitations remain visible in the
              directory until acceptance.
            </p>
          </div>
          <div className="institution-student-signal-grid">
            <div>
              <UserGroupIcon aria-hidden="true" />
              <span>
                <strong>
                  {profile.student.invitationStatus ?? "accepted"}
                </strong>
                <small>Membership status</small>
              </span>
            </div>
            <div>
              <DocumentCheckIcon aria-hidden="true" />
              <span>
                <strong>
                  {profile.student.institutionValidationStatus ?? "not set"}
                </strong>
                <small>Institution validation</small>
              </span>
            </div>
            <div>
              <AcademicCapIcon aria-hidden="true" />
              <span>
                <strong>
                  {profile.student.availabilityStatus ?? "availability"}
                </strong>
                <small>Availability</small>
              </span>
            </div>
          </div>
        </Card>

        <section className="txk-metric-grid institution-student-profile-metrics">
          <MetricCard
            label="Verified Skills"
            value={verifiedSkills.length}
            detail="Instructor-authoritative technical evidence"
          />
          <MetricCard
            label="Self-attested"
            value={selfAttestedSkills.length + inProgressSkills.length}
            detail="Student-supplied or pending review evidence"
          />
          <MetricCard
            label="Employer Training"
            value={completedTraining}
            detail={`${profile.employerTraining.length} total assignments`}
          />
          <MetricCard
            label="Company Badges"
            value={activeBadges}
            detail="Active Employer-specific readiness signals"
          />
          <MetricCard
            label="Employer pipeline"
            value={activePlacement ? "Placed" : activeInterview ? "Interview" : "—"}
            detail={
              activePlacement?.employerName ??
              activeInterview?.employerName ??
              "No active outcome"
            }
          />
          <MetricCard
            label="Retention"
            value={openRetentionCases.length}
            detail={`${profile.retention.milestones.length} milestones visible`}
          />
        </section>

        <section className="institution-student-profile-grid">
          <Card>
            <div className="txk-section-heading">
              <div>
                <p className="txk-eyebrow">Technical readiness</p>
                <h2>Verified Skills</h2>
                <p>
                  These are authoritative technical competency records and are
                  separate from self-attested skills and Employer Training.
                </p>
              </div>
            </div>
            {verifiedSkills.length ? (
              <div className="institution-evidence-stack">
                {verifiedSkills.map((skill) => (
                  <div className="institution-evidence-compact" key={skill.studentSkillId}>
                    <CheckCircleIcon aria-hidden="true" />
                    <span>
                      <strong>{skill.name}</strong>
                      <small>
                        {skill.category ?? "Skill"}
                        {skill.verifiedAt
                          ? ` · verified ${new Date(
                              skill.verifiedAt,
                            ).toLocaleDateString()}`
                          : ""}
                      </small>
                      {skill.verifiedByName ? (
                        <small>Verified by {skill.verifiedByName}</small>
                      ) : null}
                    </span>
                    <StatusBadge tone="success">Verified</StatusBadge>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No Instructor Verified Skills yet" />
            )}
          </Card>

          <Card>
            <div className="txk-section-heading">
              <div>
                <p className="txk-eyebrow">Student-supplied evidence</p>
                <h2>Self-attested and in review</h2>
                <p>
                  These records remain visibly distinct from Instructor Verified
                  Skills until reviewed.
                </p>
              </div>
            </div>
            {selfAttestedSkills.length || inProgressSkills.length ? (
              <div className="institution-evidence-stack">
                {[...selfAttestedSkills, ...inProgressSkills].map((skill) => (
                  <div className="institution-evidence-compact" key={skill.studentSkillId}>
                    <DocumentCheckIcon aria-hidden="true" />
                    <span>
                      <strong>{skill.name}</strong>
                      <small>
                        {skill.category ?? "Skill"} · {skill.provenance.replaceAll("_", " ")}
                        {skill.selfAttestedAt
                          ? ` · attested ${new Date(
                              skill.selfAttestedAt,
                            ).toLocaleDateString()}`
                          : ""}
                      </small>
                    </span>
                    <StatusBadge
                      tone={
                        skill.evidenceClass === "self_attested"
                          ? "warning"
                          : "neutral"
                      }
                    >
                      {skill.status.replaceAll("_", " ")}
                    </StatusBadge>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No self-attested skills"
                description="Student-supplied evidence will appear here before it becomes Instructor Verified."
              />
            )}
          </Card>
        </section>

        <section className="txk-section">
          <div className="txk-section-heading">
            <div>
              <p className="txk-eyebrow">Company readiness</p>
              <h2>Company Badges</h2>
            </div>
          </div>
          <Card>
            {evidence.companyBadges.length ? (
              <div className="institution-evidence-stack">
                {evidence.companyBadges.map((badge) => (
                  <div className="institution-evidence-compact" key={badge.awardId}>
                    <CheckBadgeIcon aria-hidden="true" />
                    <span>
                      <strong>{badge.title}</strong>
                      <small>
                        {badge.employerName} · earned{" "}
                        {new Date(badge.issuedAt).toLocaleDateString()}
                      </small>
                      <small>
                        {badge.courseTitle ? `${badge.courseTitle} v${badge.versionNumber}` : badge.evidenceType}
                        {badge.completedAt ? ` · passed ${new Date(badge.completedAt).toLocaleDateString()}` : ""}
                      </small>
                    </span>
                    <StatusBadge
                      tone={
                        badge.status === "active"
                          ? "success"
                          : badge.status === "expired"
                            ? "warning"
                            : "danger"
                      }
                    >
                      {badge.status}
                    </StatusBadge>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No Company Badges earned"
                description="Pending Employer Training assignments are not presented as earned evidence."
              />
            )}
          </Card>
        </section>

        <section className="txk-section">
          <div className="txk-section-heading">
            <div>
              <p className="txk-eyebrow">Employer-specific readiness</p>
              <h2>Employer Certifications</h2>
              <p>Formal Employer credentials are separate from Company Badges and Instructor Verified Skills.</p>
            </div>
          </div>
          <Card>
            {evidence.employerCertifications.length ? (
              <div className="institution-evidence-stack">
                {evidence.employerCertifications.map((certification) => (
                  <div className="institution-evidence-compact" key={certification.credentialId}>
                    <DocumentCheckIcon aria-hidden="true" />
                    <span>
                      <strong>{certification.title}</strong>
                      <small>
                        Issued by {certification.employerName} · {certification.courseTitle} v{certification.versionNumber}
                      </small>
                      <small>
                        Passed completion {new Date(certification.completedAt).toLocaleDateString()} · issued {new Date(certification.issuedAt).toLocaleDateString()}
                        {certification.expiresAt ? ` · expires ${new Date(certification.expiresAt).toLocaleDateString()}` : ""}
                      </small>
                      <small>Credential {certification.credentialId} · Employer Training evidence</small>
                      <ButtonLink href={`/credentials/${encodeURIComponent(certification.credentialId)}`} size="sm">
                        Verify credential
                      </ButtonLink>
                    </span>
                    <StatusBadge tone={certification.status === "active" ? "success" : certification.status === "expired" ? "warning" : "danger"}>
                      {certification.status}
                    </StatusBadge>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No Employer Certifications issued" description="Course assignments and Company Badges do not automatically count as formal credentials." />
            )}
          </Card>
        </section>

        <section className="txk-section">
          <div className="txk-section-heading">
            <div>
              <p className="txk-eyebrow">Company training</p>
              <h2>Employer Training</h2>
            </div>
          </div>
          {profile.employerTraining.length ? (
            <div className="institution-recent-training-list">
              {profile.employerTraining.map((assignment) => (
                <Card
                  className="institution-recent-training-row"
                  key={assignment.assignmentId}
                >
                  <div>
                    <AcademicCapIcon aria-hidden="true" />
                    <span>
                      <strong>{assignment.courseTitle}</strong>
                      <small>
                        {assignment.employerName} · Version {assignment.versionNumber}
                      </small>
                    </span>
                  </div>
                  <div>
                    <strong>
                      {assignment.progress.lessons.requiredCompleted}/
                      {assignment.progress.lessons.requiredTotal} lessons ·{" "}
                      {assignment.progress.assessments.requiredPassed}/
                      {assignment.progress.assessments.requiredTotal} assessments
                    </strong>
                    <span>
                      {assignment.companyBadge
                        ? `Badge: ${assignment.companyBadge.title}`
                        : "No Company Badge configured"}
                    </span>
                  </div>
                  <StatusBadge
                    tone={
                      assignment.status === "completed"
                        ? "success"
                        : assignment.status === "in_progress"
                          ? "info"
                          : "neutral"
                    }
                  >
                    {assignment.status === "assigned"
                      ? "Not started"
                      : assignment.status.replaceAll("_", " ")}
                  </StatusBadge>
                  <ButtonLink
                    href={`/institution/learning/assignments/${encodeURIComponent(
                      assignment.assignmentId,
                    )}`}
                    size="sm"
                  >
                    View evidence
                  </ButtonLink>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <EmptyState title="No Employer Training assignments" />
            </Card>
          )}
        </section>

        <section className="institution-student-profile-grid">
          <Card>
            <div className="txk-section-heading">
              <div>
                <p className="txk-eyebrow">Employer pipeline</p>
                <h2>Referrals</h2>
              </div>
            </div>
            {profile.referrals.length ? (
              <div className="institution-evidence-stack">
                {profile.referrals.map((referral) => (
                  <div className="institution-evidence-compact" key={referral.referralId}>
                    <UserGroupIcon aria-hidden="true" />
                    <span>
                      <strong>{referral.employerName}</strong>
                      <small>
                        {referral.referredAt
                          ? `Referred ${new Date(
                              referral.referredAt,
                            ).toLocaleDateString()}`
                          : "Referral created"}
                        {referral.hiringNeedId ? ` · Need ${referral.hiringNeedId}` : ""}
                      </small>
                    </span>
                    <StatusBadge tone="info">{referral.status}</StatusBadge>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No referrals yet" />
            )}
          </Card>

          <Card>
            <div className="txk-section-heading">
              <div>
                <p className="txk-eyebrow">Employer pipeline</p>
                <h2>Interviews</h2>
              </div>
            </div>
            {profile.interviews.length ? (
              <div className="institution-evidence-stack">
                {profile.interviews.map((interview) => (
                  <div className="institution-evidence-compact" key={interview.interviewRequestId}>
                    <UserGroupIcon aria-hidden="true" />
                    <span>
                      <strong>{interview.roleTitle ?? "Interview"}</strong>
                      <small>
                        {interview.employerName}
                        {interview.scheduledFor
                          ? ` · ${new Date(
                              interview.scheduledFor,
                            ).toLocaleString()}`
                          : ""}
                      </small>
                    </span>
                    <StatusBadge tone="info">{interview.status}</StatusBadge>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No interview activity" />
            )}
          </Card>

          <Card>
            <div className="txk-section-heading">
              <div>
                <p className="txk-eyebrow">Outcome</p>
                <h2>Placements</h2>
              </div>
            </div>
            {profile.placements.length ? (
              <div className="institution-evidence-stack">
                {profile.placements.map((placement) => (
                  <div className="institution-evidence-compact" key={placement.placementId}>
                    <BriefcaseIcon aria-hidden="true" />
                    <span>
                      <strong>{placement.roleTitle ?? "Placement"}</strong>
                      <small>
                        {placement.employerName}
                        {placement.hireDate ? ` · hired ${placement.hireDate}` : ""}
                      </small>
                    </span>
                    <StatusBadge tone={placement.status === "active" ? "success" : "neutral"}>
                      {placement.status}
                    </StatusBadge>
                  <small>{placement.officialPlacement ? `Employment started ${placement.employmentStartDate}` : "Start confirmation required"}</small>
                  {placement.canConfirmStart && !placement.startConfirmedAt ? <ConfirmStartForm placementId={placement.placementId} scheduledStartDate={placement.hireDate} /> : null}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No placement outcome recorded" />
            )}
          </Card>
        </section>

        <section className="institution-student-profile-grid">
          <Card>
            <div className="txk-section-heading">
              <div>
                <p className="txk-eyebrow">Retention</p>
                <h2>Milestones</h2>
              </div>
            </div>
            {profile.retention.milestones.length ? (
              <div className="institution-evidence-stack">
                {profile.retention.milestones.map((milestone) => (
                  <div className="institution-evidence-compact" key={milestone.milestoneId}>
                    <CheckCircleIcon aria-hidden="true" />
                    <span>
                      <strong>
                        Day {milestone.dayNumber} · {milestone.employerName}
                      </strong>
                      <small>
                        {milestone.roleTitle ?? "Placement"} · scheduled{" "}
                        {new Date(milestone.scheduledFor).toLocaleDateString()}
                      </small>
                    </span>
                    <StatusBadge
                      tone={
                        milestone.status === "responded"
                          ? "success"
                          : milestone.status === "failed"
                            ? "danger"
                            : "neutral"
                      }
                    >
                      {milestone.status}
                    </StatusBadge>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No retention milestones" />
            )}
          </Card>

          <Card>
            <div className="txk-section-heading">
              <div>
                <p className="txk-eyebrow">Retention</p>
                <h2>Cases</h2>
              </div>
            </div>
            {profile.retention.cases.length ? (
              <div className="institution-evidence-stack">
                {profile.retention.cases.map((retentionCase) => (
                  <div className="institution-evidence-compact" key={retentionCase.caseId}>
                    <DocumentCheckIcon aria-hidden="true" />
                    <span>
                      <strong>{retentionCase.employerName}</strong>
                      <small>
                        {retentionCase.roleTitle ?? "Placement"} ·{" "}
                        {retentionCase.severity} severity · opened{" "}
                        {new Date(retentionCase.openedAt).toLocaleDateString()}
                      </small>
                    </span>
                    <StatusBadge
                      tone={
                        retentionCase.status === "resolved"
                          ? "success"
                          : retentionCase.status === "cancelled"
                            ? "neutral"
                            : "warning"
                      }
                    >
                      {retentionCase.status}
                    </StatusBadge>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No retention cases"
                description="Case notes and raw retention replies are not exposed here."
              />
            )}
          </Card>
        </section>

        <section className="txk-section institution-learning-connection">
          <div>
            <p className="txk-eyebrow">Permitted activity</p>
            <h2>Activity history</h2>
            <p>
              This timeline includes event type, status, and timestamp only;
              private Employer notes, interview evaluations, and retention
              response text stay outside the Institution Student profile.
            </p>
          </div>
          <div className="institution-evidence-stack">
            {profile.activity.length ? (
              profile.activity.map((activity) => (
                <div className="institution-evidence-compact" key={`${activity.activityType}-${activity.sourceId}`}>
                  <BriefcaseIcon aria-hidden="true" />
                  <span>
                    <strong>{activity.title}</strong>
                    <small>
                      {activity.activityType.replaceAll("_", " ")} ·{" "}
                      {new Date(activity.occurredAt).toLocaleString()}
                    </small>
                  </span>
                  <StatusBadge tone="neutral">{activity.status}</StatusBadge>
                </div>
              ))
            ) : (
              <EmptyState title="No permitted activity yet" />
            )}
          </div>
        </section>

        <section className="txk-section institution-learning-connection">
          <div>
            <p className="txk-eyebrow">Evidence boundary</p>
            <h2>Readiness signals remain explainable</h2>
            <p>
              Verified Skills, self-attested skills, Employer Training, Company
              Badges, referrals, interviews, placements, and retention outcomes
              are displayed separately. TXKPRO does not merge them into a hidden
              employability score.
            </p>
          </div>
          <div className="txk-reference-row">
            <ButtonLink href="/institution/readiness">
              <WrenchScrewdriverIcon aria-hidden="true" />
              Workforce Readiness
            </ButtonLink>
            <ButtonLink href="/institution/referrals">
              Referral context
            </ButtonLink>
          </div>
        </section>
      </main>
    </>
  );
}
