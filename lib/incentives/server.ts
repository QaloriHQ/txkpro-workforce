import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { PointsWorkspace } from "@/lib/pro-points/types";
import type { Extension } from "./contracts";
export async function incentiveRpc<T>(
  name: string,
  args: Record<string, unknown> = {},
) {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc(name, args);
  if (error)
    throw Response.json(
      {
        error:
          error.code === "40001"
            ? "This program changed. Reload before saving."
            : error.code === "42501"
              ? "This action is unavailable for your account or program."
              : error.code === "23505"
                ? "This entry already exists. Refresh to see it."
                : "Check the values and current program state.",
      },
      {
        status:
          error.code === "40001" || error.code === "23505"
            ? 409
            : error.code === "42501"
              ? 403
              : 400,
      },
    );
  return data as T;
}
export async function employerIncentives(owner: string) {
  const [points, extension] = await Promise.all([
    incentiveRpc<PointsWorkspace>("incentive_employer_workspace", {
      p_owner: owner,
    }),
    incentiveRpc<Extension>("incentive_workspace"),
  ]);
  const ids = new Set(points.programs.map((p) => p.id));
  return {
    points,
    extension: {
      assignments: Object.fromEntries(
        Object.entries(extension.assignments).filter(([id]) => ids.has(id)),
      ),
      configs: extension.configs.filter((c) => ids.has(c.programId)),
      cases: Object.fromEntries(
        Object.entries(extension.cases).filter(([id]) => ids.has(id)),
      ),
      audit: Object.fromEntries(
        Object.entries(extension.audit).filter(([id]) => ids.has(id)),
      ),
    },
  };
}
