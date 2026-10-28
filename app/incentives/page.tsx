import { rewardWorkspace } from "@/lib/rewards/server";
import { RewardsPanel } from "@/components/rewards/panel";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getAccountContext } from "@/lib/auth";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { pointsWorkspace } from "@/lib/pro-points/server";
import { IncentiveWorkspace } from "@/components/pro-points/workspace";
import { incentiveRpc } from "@/lib/incentives/server";
import type { Extension } from "@/lib/incentives/contracts";
import { OperationalCases } from "@/components/incentives/detail";
export const dynamic = "force-dynamic";
export default async function Programs() {
  if (!(await getAccountContext())) redirect("/login");
  const [data, rewards, extension] = await Promise.all([
    pointsWorkspace(),
    rewardWorkspace(),
    incentiveRpc<Extension>("incentive_workspace"),
  ]);
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
        {data.programs
          .filter(
            (p) =>
              p.ownerType === "employer" &&
              p.participation?.status === "active" &&
              extension.configs.some(
                (c) => c.programId === p.id && c.published,
              ),
          )
          .map((p) => (
            <section key={p.id}>
              <h2>{p.name}</h2>
              <OperationalCases
                program={p}
                cases={extension.cases[p.id] ?? []}
              />
            </section>
          ))}
        <RewardsPanel data={rewards} points={data} />
      </main>
    </>
  );
}
