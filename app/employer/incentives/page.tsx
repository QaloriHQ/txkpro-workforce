import { Brand } from "@/components/brand";
import { EmployerWorkspaceNav } from "@/components/employer/workspace-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { requireEmployerContext } from "@/lib/employer/auth";
import { pointsWorkspace } from "@/lib/pro-points/server";
import { IncentiveWorkspace } from "@/components/pro-points/workspace";
export const dynamic = "force-dynamic";
export default async function Programs() {
  await requireEmployerContext({ approved: true });
  const data = await pointsWorkspace();
  return (
    <>
      <header className="topbar employer-topbar">
        <Brand />
        <EmployerWorkspaceNav active="incentives" />
        <div className="header-actions">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </header>
      <main className="page-wrap txk-prototype-content">
        <h1>Incentive programs</h1>
        <p className="card-sub">
          Private programs with separate employee and sponsored Student
          participation.
        </p>
        <IncentiveWorkspace data={data} ownerType="employer" />
      </main>
    </>
  );
}
