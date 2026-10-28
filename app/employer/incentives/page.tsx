import { requireEmployerContext, canManageCompany } from "@/lib/employer/auth";
import { employerIncentives } from "@/lib/incentives/server";
import { IncentiveShell } from "@/components/incentives/shell";
import { ProgramGallery } from "@/components/incentives/gallery";
import { rewardWorkspace } from "@/lib/rewards/server";
export const dynamic = "force-dynamic";
export default async function Programs() {
  const context = await requireEmployerContext({ approved: true });
  const [{ points, extension }, rewards] = await Promise.all([
    employerIncentives(context.employerId),
    rewardWorkspace(),
  ]);
  return (
    <IncentiveShell>
      <ProgramGallery
        programs={points.programs}
        configs={extension.configs}
        canCreate={canManageCompany(context.role)}
        financials={Object.fromEntries(
          points.programs.map((p) => [
            p.id,
            {
              committedCents:
                rewards.policies.find((q) => q.programId === p.id)
                  ?.liabilityCents ?? 0,
              issuedCents: rewards.requests
                .filter((r) => r.programId === p.id && r.status === "issued")
                .reduce((n, r) => n + r.cents, 0),
            },
          ]),
        )}
      />
    </IncentiveShell>
  );
}
