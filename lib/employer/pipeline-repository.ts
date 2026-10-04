import "server-only";
import type { EmployerContext } from "@/lib/employer/types";
import { listEmployerInterviews, listEmployerPlacements } from "@/lib/employer/hiring-repository";
import { listReferrals } from "@/lib/employer/workflow-repository";
import type { HiringRecords } from "@/lib/employer/candidate-pipeline";

// Existing authenticated RPCs enforce company and assigned Hiring Manager scope.
// Never replace these reads with a service-role query or client-side authorization.
export async function getEmployerHiringRecords(context: EmployerContext): Promise<HiringRecords> {
  const [referrals, interviews, placements] = await Promise.all([
    listReferrals(context), listEmployerInterviews(context), listEmployerPlacements(context),
  ]);
  return { referrals, interviews, placements };
}
