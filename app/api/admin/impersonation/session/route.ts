import { impersonationEnabled, requireSameOrigin } from "@/lib/impersonation/session-contract";
import {
  createImpersonationRegistrySession,
  exitImpersonationRegistrySession,
  getImpersonationRegistrySession,
} from "@/lib/impersonation/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

function responseError(error: unknown) {
  const status = error instanceof Response && error.status < 500 ? error.status : 503;
  return Response.json({ error: status === 503 ? "Impersonation capability is unavailable." : "Invalid or unauthorized impersonation request." }, { status, headers });
}

export async function POST(request: Request) {
  // This route is deliberately inaccessible until SEC-IMP-02 is certified.
  if (!impersonationEnabled()) return Response.json({ error: "Not available" }, { status: 404, headers });
  try {
    requireSameOrigin(request);
    const raw = await request.text();
    if (raw.length > 512) throw new Response("Request too large", { status: 413 });
    let input: Record<string, unknown>;
    try { input = JSON.parse(raw) as Record<string, unknown>; } catch { throw new Response("Invalid JSON", { status: 400 }); }
    const result = await createImpersonationRegistrySession({
      targetAuthUserId: typeof input.targetAuthUserId === "string" ? input.targetAuthUserId : "",
      membershipKey: typeof input.membershipKey === "string" ? input.membershipKey : "",
    });
    return Response.json({ ok: true, data: result }, { status: 201, headers });
  } catch (error) { return responseError(error); }
}

export async function GET() {
  if (!impersonationEnabled()) return Response.json({ error: "Not available" }, { status: 404, headers });
  try {
    const session = await getImpersonationRegistrySession();
    return Response.json({ ok: true, active: Boolean(session),
      data: session ? {
        sessionId: session.session.id,
        targetName: session.target.name,
        targetAuthUserId: session.target.authUserId,
        membershipKey: session.session.target_membership_key,
        expiresAt: session.session.expires_at,
      } : null }, { headers });
  } catch (error) { return responseError(error); }
}

export async function DELETE(request: Request) {
  if (!impersonationEnabled()) return Response.json({ error: "Not available" }, { status: 404, headers });
  try {
    requireSameOrigin(request);
    await exitImpersonationRegistrySession();
    return Response.json({ ok: true }, { headers });
  } catch (error) { return responseError(error); }
}
