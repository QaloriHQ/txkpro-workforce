import { notFound } from "next/navigation";
import { requireEmployerContext } from "@/lib/employer/auth";
import { employerIncentives } from "@/lib/incentives/server";
import { rewardWorkspace } from "@/lib/rewards/server";
import { IncentiveShell, BackToPrograms } from "@/components/incentives/shell";
import { ProgramDetail } from "@/components/incentives/detail";
export const dynamic = "force-dynamic";
export default async function Detail({
  params,
}: {
  params: Promise<{ programId: string }>;
}) {
  const { programId } = await params;
  const c = await requireEmployerContext({ approved: true });
  const [{ points, extension }, rewards] = await Promise.all([
    employerIncentives(c.employerId),
    rewardWorkspace(),
  ]);
  const program = points.programs.find((p) => p.id === programId);
  if (!program) notFound();
  return (
    <IncentiveShell>
      <BackToPrograms />
      <ProgramDetail
        program={program}
        points={points}
        configuration={extension.configs.find((c) => c.programId === programId)}
        assignments={extension.assignments[programId] ?? []}
        cases={extension.cases[programId] ?? []}
        audit={extension.audit[programId] ?? []}
        rewards={{
          ...rewards,
          accounts: rewards.accounts.filter(
            (a) => a.ownerType === "employer" && a.ownerId === c.employerId,
          ),
          funding: rewards.funding.filter(
            (f) => f.ownerType === "employer" && f.ownerId === c.employerId,
          ),
          policies: rewards.policies.filter((p) => p.programId === programId),
          requests: rewards.requests.filter((r) => r.programId === programId),
          credits: rewards.credits.filter((r) => r.programId === programId),
        }}
      />
    </IncentiveShell>
  );
}
