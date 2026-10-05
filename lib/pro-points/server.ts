import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PointsWorkspace, Summary } from "./types";
export async function pointsWorkspace(): Promise<PointsWorkspace> {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("pro_workspace");
  if (error)
    throw new Response("Points workspace unavailable.", {
      status: error.code === "42501" ? 403 : 503,
    });
  return data as PointsWorkspace;
}
export async function pointsAction(input: Record<string, unknown>) {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("pro_action", { p_input: input });
  if (error) {
    // Only actionable contract errors are returned. Constraint/SQL details stay private.
    const safe =
      /^(Owner scope denied|Active authentication required|Program unavailable|Invitation unavailable|Review current terms|Active accepted participation required|Activity audience denied|Activity is not scheduled today|Select a valid answer|Completion evidence required|Program management scope denied|Invalid program transition|Program end must be in the future|Recipient needs an activated TXKPRO account before program invitation|Active program required|Participation type unavailable|Eligible Student affiliation required|Participant transition unavailable|Activities are fixed at activation; create a new program for changed rules|Invalid audience|Submission scope denied|Self approval denied|Review reason required \(maximum 1000 characters\)|Only approved evidence can be reversed|Pending submission and active participant required|Unsupported action)$/;
    throw Response.json(
      {
        error: safe.test(error.message)
          ? error.message
          : error.code === "23505"
            ? "This invitation or activity was already recorded."
            : "Check the form values and try again.",
      },
      {
        status:
          error.code === "42501" ? 403 : error.code === "23505" ? 409 : 400,
      },
    );
  }
  return data;
}
export async function publicPoints(path: string): Promise<Summary | null> {
  const { data, error } = await createAdminClient().rpc("pro_public", {
    p_path: path,
  });
  if (error) throw new Error("Profile progress is temporarily unavailable.");
  return data as Summary | null;
}

export async function pointsSummary(): Promise<Summary> {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("pro_self_summary");
  if (error)
    throw new Response("Student progress unavailable.", {
      status: error.code === "42501" ? 403 : 503,
    });
  return data as Summary;
}
