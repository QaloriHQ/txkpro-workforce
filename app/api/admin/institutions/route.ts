import { getAccountContext } from "@/lib/auth";
import { isPlatformSuperAdmin } from "@/lib/institutions";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const account = await getAccountContext();
  if (!account) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isPlatformSuperAdmin(account)) return Response.json({ error: "Platform Super Admin required" }, { status: 403 });
  try {
    const raw = await request.text();
    if (raw.length > 4_000) return Response.json({ error: "Request is too large." }, { status: 413 });
    const body = JSON.parse(raw);
    if (!body || typeof body !== "object" || ["requestKey", "name", "institutionType", "city", "state"].some(key => typeof body[key] !== "string")) {
      return Response.json({ error: "Please check the institution details." }, { status: 400 });
    }
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("platform_institution_create", {
      p_request_key: body.requestKey, p_name: body.name, p_institution_type: body.institutionType, p_city: body.city, p_state: body.state,
    });
    if (error) return Response.json({ error: error.message }, { status: error.code === "42501" ? 403 : 400 });
    return Response.json(data, { status: data?.created ? 201 : 200 });
  } catch { return Response.json({ error: "Unable to create institution. Please check the details and try again." }, { status: 400 }); }
}
