import {
  ArrowLeftIcon,
  DocumentCheckIcon,
} from "@heroicons/react/24/outline";
import { Brand } from "@/components/brand";
import {
  ButtonLink,
  MetricCard,
  PageHeader,
  RoleViewBanner,
} from "@/components/design-system";
import { EmployerCertificationLibrary } from "@/components/employer/learning/employer-certification-library";
import { EmployerWorkspaceNav } from "@/components/employer/workspace-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireEmployerContext } from "@/lib/employer/auth";
import {
  listEmployerCertificationAwards,
  listEmployerCertificationDefinitions,
  listEmployerMicroCerts,
} from "@/lib/employer/learning-repository";

export const dynamic = "force-dynamic";

export default async function EmployerCertificationsPage() {
  const context = await requireEmployerContext({ approved: true });
  const [definitions, awards, courses] = await Promise.all([
    listEmployerCertificationDefinitions(context),
    listEmployerCertificationAwards(context),
    listEmployerMicroCerts(context),
  ]);
  const canManage =
    context.role === "employer_owner" || context.role === "employer_admin";
  const activeDefinitions = definitions.filter(
    (definition) => definition.active,
  ).length;
  const activeAwards = awards.filter((award) => award.status === "active").length;
  const expiredAwards = awards.filter((award) => award.status === "expired").length;
  const revokedAwards = awards.filter((award) => award.status === "revoked").length;

  return (
    <>
      <header className="topbar employer-topbar">
        <Brand />
        <EmployerWorkspaceNav active="learning" />
        <div className="header-actions">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </header>

      <main className="page-wrap txk-prototype-content">
        <PageHeader
          eyebrow="Employer Learning · Formal Credentials"
          title="Employer Certifications"
          description="Define and verify formal Employer-issued credentials generated from canonical passed Employer Training completion evidence."
          actions={
            <ButtonLink href="/employer/learning">
              <ArrowLeftIcon aria-hidden="true" />
              Employer Learning
            </ButtonLink>
          }
        />

        <RoleViewBanner title="Formal Employer-issued credentials">
          Employer Certifications preserve issuer, learner, exact course
          version, completion evidence, credential ID, issue date, expiration,
          and revocation state. They remain separate from Company Badges and
          Instructor Verified Skills.
        </RoleViewBanner>

        <section
          className="txk-metric-grid txk-learning-metrics"
          aria-label="Employer Certification summary"
        >
          <MetricCard
            label="Definitions"
            value={definitions.length}
            detail={activeDefinitions + " active"}
          />
          <MetricCard
            label="Active credentials"
            value={activeAwards}
            detail="Valid and not expired"
          />
          <MetricCard
            label="Expired"
            value={expiredAwards}
            detail="Expiration policy reached"
          />
          <MetricCard
            label="Revoked"
            value={revokedAwards}
            detail="Credential history retained"
          />
        </section>

        <div className="txk-inline-heading">
          <div>
            <p className="txk-eyebrow">Credential boundary</p>
            <h2>Certification is not technical skill verification</h2>
          </div>
          <DocumentCheckIcon
            className="txk-requirements-icon"
            aria-hidden="true"
          />
        </div>

        <EmployerCertificationLibrary
          definitions={definitions}
          awards={awards}
          courses={courses}
          canManage={canManage}
        />
      </main>
    </>
  );
}
