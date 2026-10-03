import { getAccountContext } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  if (!(await getAccountContext())) {
    return Response.json(
      { error: "Sign in to confirm employment started." },
      { status: 401 },
    );
  }
  let body: { startDate?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Provide an actual employment start date." },
      { status: 400 },
    );
  }
  if (
    !body ||
    typeof body.startDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(body.startDate)
  ) {
    return Response.json(
      { error: "Provide an actual employment start date." },
      { status: 400 },
    );
  }
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  // Database authorization binds each trusted role to the placement's scope.
  const { data, error } = await supabase.rpc("placement_confirm_start", {
    p_placement_id: id,
    p_start_date: body.startDate,
  });
  if (error) {
    const status =
      error.code === "42501" ? 403 : error.code.startsWith("22") ? 400 : 500;
    return Response.json(
      {
        error:
          status === 500
            ? "Unable to confirm employment start."
            : error.message,
      },
      { status },
    );
  }
  return Response.json({ ok: true, placement: data });
}
