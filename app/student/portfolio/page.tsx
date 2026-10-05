import { StudentWorkspaceHeader } from "@/components/student/workspace-header";
import { redirect } from "next/navigation";
import { StudentWorkspaceNav } from "@/components/student/workspace-nav";
import { PortfolioEditor } from "@/components/student/portfolio-editor";
import { PortfolioView } from "@/components/student/portfolio-view";
import { studentPortfolio } from "@/lib/student-portfolio/repository";
import { studentPublicSettings } from "@/lib/student-public-profile/repository";
import { getStudentContext } from "@/lib/student/auth";
export const dynamic = "force-dynamic";
export default async function PortfolioPage() {
  const context = await getStudentContext();
  if (!context) redirect("/dashboard");
  const [portfolio, settings] = await Promise.all([
    studentPortfolio(),
    studentPublicSettings(),
  ]);
  return (
    <>
      <StudentWorkspaceHeader firstName={context.firstName} lastName={context.lastName} />
      <StudentWorkspaceNav active="portfolio" />
      <main className="page-wrap student-training-page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">My professional portfolio</p>
            <h1>Show what you can do</h1>
            <p className="card-sub">
              Build your digital resume, share projects, and control every file.
            </p>
          </div>
          {settings.visibility === "public" && settings.path ? (
            <a
              className="button"
              href={settings.path}
              target="_blank"
              rel="noopener noreferrer"
            >
              Preview public profile
            </a>
          ) : null}
        </div>
        <PortfolioEditor initial={portfolio} />
        <PortfolioView
          portfolio={portfolio}
          displayName={settings.displayName || context.firstName}
          headline={settings.headline}
          bio={settings.bio}
        />
      </main>
    </>
  );
}
