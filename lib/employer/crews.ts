import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  EmployerCrew,
  EmployerCrewWorkspace,
} from "@/lib/employer/crew-contracts";

async function crewRpc<T>(name: string, args: Record<string, unknown>) {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc(name, args);
  if (error)
    throw Response.json(
      {
        error:
          error.code === "23505"
            ? "A crew with this name already exists."
            : error.code === "42501"
              ? "This crew action is unavailable for your account or organization."
              : "Check the crew name and selected members.",
      },
      {
        status:
          error.code === "23505" ? 409 : error.code === "42501" ? 403 : 400,
      },
    );
  return data as T;
}

export function employerCrewWorkspace(employerId: string) {
  return crewRpc<EmployerCrewWorkspace>("employer_crew_workspace", {
    p_employer: employerId,
  });
}

export async function createEmployerCrew(input: {
  employerId: string;
  name: string;
  description?: string | null;
  memberUserIds: string[];
}) {
  const result = await crewRpc<{ crew: EmployerCrew }>(
    "employer_crew_action",
    {
      p_input: {
        op: "create",
        employerId: input.employerId,
        name: input.name,
        description: input.description ?? null,
        memberUserIds: input.memberUserIds,
      },
    },
  );
  return result.crew;
}
