import { redirect } from "next/navigation";
import Link from "next/link";
import { getAccountContext } from "@/lib/auth";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { pointsWorkspace } from "@/lib/pro-points/server";
import { IncentiveWorkspace } from "@/components/pro-points/workspace";
export const dynamic = "force-dynamic";
export default async function Programs() {
  if (!(await getAccountContext())) redirect("/login");
  const data = await pointsWorkspace();
  return (
    <>
      <header className="topbar">
        <Brand />
        <Link className="button" href="/dashboard">
          Workspace
        </Link>
        <div className="header-actions">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </header>
      <main className="page-wrap">
        <h1>Incentive programs</h1>
        <IncentiveWorkspace data={data} />
      </main>
    </>
  );
}
