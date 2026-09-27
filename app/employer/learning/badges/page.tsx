import { ArrowLeftIcon, CheckBadgeIcon } from "@heroicons/react/24/outline";
import { Brand } from "@/components/brand";
import {
  ButtonLink,
  MetricCard,
  PageHeader,
  RoleViewBanner,
} from "@/components/design-system";
import { CompanyBadgeLibrary } from "@/components/employer/learning/company-badge-library";
import { EmployerWorkspaceNav } from "@/components/employer/workspace-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireEmployerContext } from "@/lib/employer/auth";
import {
  listEmployerCompanyBadgeAwards,
  listEmployerCompanyBadges,
} from "@/lib/employer/learning-repository";

export const dynamic = "force-dynamic";

export default async function EmployerCompanyBadgesPage() {
  const context = await requireEmployerContext({ approved: true });
  const [badges, awards] = await Promise.all([
    listEmployerCompanyBadges(context),
    listEmployerCompanyBadgeAwards(context),
  ]);
  const canManage =
    context.role === "employer_owner" || context.role === "employer_admin";
  const activeBadges = badges.filter((badge) => badge.active).length;
  const activeAwards = awards.filter((award) => award.status === "active").length;

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
          eyebrow="Employer Learning · Company Badges"
          title="Company Badges"
          description="Define Employer-specific readiness signals and review awards generated from canonical passed Employer Training completion evidence."
          actions={
            <ButtonLink href="/employer/learning">
              <ArrowLeftIcon aria-hidden="true" />
              Employer Learning
            </ButtonLink>
          }
        />

        <RoleViewBanner title="Company-specific readiness">
          Company Badges show successful completion of Employer-specific
          readiness content. They do not replace Instructor Verified Skills and
          are not a general employability score or hiring recommendation.
        </RoleViewBanner>

        <section className="txk-metric-grid txk-learning-metrics" aria-label="Company Badge summary">
          <MetricCard label="Definitions" value={badges.length} detail="Employer-owned badge definitions" />
          <MetricCard label="Active definitions" value={activeBadges} detail="Eligible for future awards" />
          <MetricCard label="Awards" value={awards.length} detail="Canonical award records" />
          <MetricCard label="Active awards" value={activeAwards} detail="Not expired or revoked" />
        </section>

        <div className="txk-inline-heading">
          <div>
            <p className="txk-eyebrow">Evidence boundary</p>
            <h2>Employer readiness, not technical verification</h2>
          </div>
          <CheckBadgeIcon className="txk-requirements-icon" aria-hidden="true" />
        </div>

        <CompanyBadgeLibrary badges={badges} awards={awards} canManage={canManage} />
      </main>
    </>
  );
}
