import { Brand } from "@/components/brand";
import { EmployerWorkspaceNav } from "@/components/employer/workspace-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { getAccountContext } from "@/lib/auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ScreeningWorkspace } from "@/components/screening/workspace";
import { workspace, configured } from "@/lib/authenticate/server";
export const dynamic = "force-dynamic";
export default async function Screening({ searchParams, }: {
    searchParams: Promise<{
        employer?: string;
    }>;
}) {
    const account = await getAccountContext();
    if (!account)
        redirect("/login");
    const requested = (await searchParams).employer;
    const membership = account.memberships.find((m) => m.status === "active" &&
        ["employer", "contractor"].includes(m.scope_type) &&
        (!requested || m.scope_id === requested));
    if (!membership?.scope_id)
        redirect("/dashboard");
    const employerId = membership.scope_id;
    const employee = membership.role === "employer_employee";
    let data;
    try {
        data = await workspace({ ownerType: "employer", ownerId: employerId });
    }
    catch (e) {
        if (e instanceof Response && e.status === 403)
            return <main className="page-wrap"><h1>Background checks</h1><p>Your administrator must grant screening access.</p></main>;
        throw e;
    }
    return (<>
      <header className="topbar employer-topbar">
        <Brand />
        {employee ? (<Link className="button" href="/employee">
            Employee workspace
          </Link>) : (<EmployerWorkspaceNav active="screening"/>)}
        <div className="header-actions">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </header>
      <main className="page-wrap txk-prototype-content">
        <h1>Background checks</h1>
        <ScreeningWorkspace initial={data} ownerType="employer" ownerId={employerId} configured={configured()}/>
      </main>
    </>);
}
