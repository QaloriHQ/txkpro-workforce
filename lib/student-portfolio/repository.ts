import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { StudentPortfolio } from "./types";
export const portfolioBucket = "student-portfolio";
export const noStore = { "Cache-Control": "private, no-store" };
export async function portfolioRpc<T>(
  name: string,
  args: Record<string, unknown>,
) {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc(name, args);
  if (error)
    throw new Response(
      error.code === "42501"
        ? "Portfolio item unavailable."
        : ["22023", "22P02", "23514", "23502", "23503"].includes(error.code)
          ? "Check your portfolio fields and file selection."
          : "Portfolio temporarily unavailable.",
      {
        status:
          error.code === "42501"
            ? 403
            : ["22023", "22P02", "23514", "23502", "23503"].includes(error.code)
              ? 400
              : 503,
      },
    );
  return data as T;
}
export async function studentPortfolio(
  input: Record<string, unknown> | null = null,
) {
  const client = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) throw new Response("Sign in required.", { status: 401 });
  return portfolioRpc<StudentPortfolio>("student_portfolio", {
    p_input: input,
  });
}
export async function portfolioFailure(error: unknown) {
  return Response.json(
    {
      error:
        error instanceof Response
          ? await error.text()
          : "Portfolio temporarily unavailable.",
    },
    {
      status: error instanceof Response ? error.status : 503,
      headers: noStore,
    },
  );
}
