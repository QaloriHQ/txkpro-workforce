import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { StudentWorkspaceNav } from "@/components/student/workspace-nav";
import { getStudentContext } from "@/lib/student/auth";
import {
  listStudentInterviews,
  listStudentPlacements,
} from "@/lib/student/workflow-repository";
import { listStudentEmployerTrainingAssignments } from "@/lib/student/learning-repository";
import {
  AcademicCapIcon,
  BriefcaseIcon,
  Square3Stack3DIcon,
} from "@heroicons/react/24/outline";
export const dynamic = "force-dynamic";
export default async function StudentHome() {
  const context = await getStudentContext();
  if (!context) redirect("/dashboard");
  const [interviews, placements, training] = await Promise.all([
    listStudentInterviews(),
    listStudentPlacements(),
    listStudentEmployerTrainingAssignments(),
  ]);
  const active = training.filter((a) => a.status !== "cancelled");
  return (
    <>
      <header className="topbar">
        <Brand />
        <div className="header-actions">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </header>
      <StudentWorkspaceNav active="workspace" trainingCount={active.length} />
      <main className="page-wrap student-training-page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Your next step starts here</p>
            <h1>Welcome, {context.firstName || "Student"}</h1>
            <p className="card-sub">
              Build your skills. Showcase your work. Move your career forward.
            </p>
          </div>
        </div>
        <div className="portfolio-grid student-home-links">
          <Link className="portfolio-item" href="/student/employer-training">
            <AcademicCapIcon aria-hidden="true" />
            <h2>Keep learning</h2>
            <p>
              {active.filter((a) => a.status !== "completed").length} active
              training assignments
            </p>
            <strong>Open learning →</strong>
          </Link>
          <Link className="portfolio-item" href="/student/opportunities">
            <BriefcaseIcon aria-hidden="true" />
            <h2>Your opportunities</h2>
            <p>
              {interviews.length} interview requests ·{" "}
              {placements.filter((p) => p.officialPlacement).length} confirmed
              placements
            </p>
            <strong>View interviews & employment →</strong>
          </Link>
          <Link className="portfolio-item" href="/student/portfolio">
            <Square3Stack3DIcon aria-hidden="true" />
            <h2>Showcase your work</h2>
            <p>
              Add your resume, certificates, project photos and demonstrated
              skills.
            </p>
            <strong>Build your portfolio →</strong>
          </Link>
        </div>
        <section className="card" style={{ marginTop: 24 }}>
          <h2>Recent interview activity</h2>
          {interviews.length ? (
            <div className="portfolio-grid">
              {interviews.slice(0, 3).map((i) => (
                <article className="portfolio-item" key={i.interviewRequestId}>
                  <h3>{i.employerName}</h3>
                  <p>{i.roleTitle}</p>
                  <span className="pill">{i.status.replaceAll("_", " ")}</span>
                  <div className="portfolio-actions">
                    <Link href="/student/opportunities">
                      View details & respond
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty">Your interview requests will appear here.</p>
          )}
        </section>
      </main>
    </>
  );
}
