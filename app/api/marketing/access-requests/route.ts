import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const headers = { "cache-control": "no-store", "x-content-type-options": "nosniff" };

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 8_000) return Response.json({ error: "Request is too large." }, { status: 413, headers });
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Please check the request fields." }, { status: 400, headers });
  }
  if (body.website) return Response.json({ ok: true }, { headers });
  const required = ["contactName", "email", "role", "intent"];
  if (required.some(key => typeof body[key] !== "string" || !(body[key] as string).trim()) ||
    ["organizationName", "message"].some(key => body[key] !== undefined && typeof body[key] !== "string")) {
    return Response.json({ error: "Please complete the required fields." }, { status: 400, headers });
  }
  try {
    const { error } = await createAdminClient().rpc("marketing_access_request", {
      p_contact_name: body.contactName,
      p_email: body.email,
      p_requested_role: body.role,
      p_intent: body.intent,
      p_organization_name: body.organizationName ?? null,
      p_message: body.message ?? null,
    });
    if (error) return Response.json({ error: error.code === "P0001" ? "Please check the request fields." : "Unable to submit right now. Please try again shortly." }, { status: error.code === "P0001" ? 400 : 503, headers });
    return Response.json({ ok: true }, { status: 201, headers });
  } catch {
    return Response.json({ error: "Unable to submit right now. Please try again shortly." }, { status: 503, headers });
  }
}
