import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { PageHeader, EmptyState } from "@/components/design-system";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { getAccountContext, hasEmployeeMembership } from "@/lib/auth";
import { classRpc } from "@/lib/classes/server";
export const dynamic = "force-dynamic";
export default async function Employee() {
  const account = await getAccountContext();
  if (!account) redirect("/login");
  if (!hasEmployeeMembership(account)) redirect("/dashboard");
  const data = await classRpc<{
    employers: {
      id: string;
      name: string;
      courses: { title: string; path: string }[];
    }[];
  }>("employee_workspace");
  return (
    <>
      <header className="topbar">
        <Brand />
        <nav className="employee-workspace-nav" aria-label="Employee workspace">
          <Link className="button" href="/employee" aria-current="page">
            Training
          </Link>
          <Link className="button" href="/incentives">
            My incentives
          </Link>
        </nav>
        <div className="header-actions">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </header>
      <main className="page-wrap">
        <PageHeader
          eyebrow="Employee workspace"
          title={`Welcome${account.firstName ? `, ${account.firstName}` : ""}`}
          description="Explore company training and participate in your accepted incentive programs."
        />
        {data.employers.map((employer) => (
          <section className="card" key={employer.id}>
            <h2>{employer.name} training</h2>
            <Link
              className="button"
              href={`/employer/screening?employer=${encodeURIComponent(employer.id)}`}
            >
              Screening permissions
            </Link>
            <p className="card-sub">
              Published learning resources. Viewing a resource does not record a
              training completion or issue a credential.
            </p>
            {employer.courses.length ? (
              <div className="institution-evidence-stack">
                {employer.courses.map((course) => (
                  <Link className="button" key={course.path} href={course.path}>
                    {course.title}
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No published training yet"
                description="Your employer can publish training resources. Training activities assigned through incentive programs are available in My incentives."
              />
            )}
          </section>
        ))}
        <section className="card">
          <h2>My incentive programs</h2>
          <p>
            Review invitations, accept program terms and complete activities in
            your authorized programs.
          </p>
          <Link className="button button-dark" href="/incentives">
            View my programs
          </Link>
        </section>
      </main>
    </>
  );
}
