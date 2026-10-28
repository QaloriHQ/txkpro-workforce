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
import { ExecutionPanel } from "@/components/incentives/execution";
import { engineWorkspace } from "@/lib/incentives/server";
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
  const eligible = data.programs.filter(
    (p) =>
      p.ownerType === "employer" &&
      p.participation?.acceptedVersion !== null &&
      p.participation?.acceptedVersion !== undefined,
  );
  const engines = Object.fromEntries(
    await Promise.all(
      eligible.map(async (p) => [p.id, await engineWorkspace(p.id)] as const),
    ),
  );
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
        {eligible.map((p) => (
          <ExecutionPanel
            key={p.id}
            program={{ ...p, canManage: false }}
            definition={
              extension.configs.find((c) => c.programId === p.id)?.published ??
              undefined
            }
            data={engines[p.id]}
          />
        ))}
        <RewardsPanel data={rewards} points={data} />
      </main>
    </>
  );
}
