import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchReward, rewardConfig } from "@/lib/rewards/server";
// The provider adapter itself is fixed to testflight and the staging origin.
export async function runIncentiveJobs(tick = false) {
  rewardConfig();
  const client = createAdminClient();
  const { data, error } = await client.rpc("incentive_jobs", {
    p_input: { op: tick ? "run" : "claim" },
  });
  if (error) throw new Error("Incentive job queue unavailable");
  let completed = 0,
    failed = 0;
  for (const requestId of (data?.requests ?? []) as string[]) {
    let ok = false;
    try {
      await dispatchReward(requestId, false);
      ok = true;
      completed++;
    } catch {
      failed++;
    }
    const result = await client.rpc("incentive_jobs", {
      p_input: { op: "finish", requestId, ok },
    });
    if (result.error) throw new Error("Job outcome requires reconciliation");
  }
  return { completed, failed, sandbox: true };
}
