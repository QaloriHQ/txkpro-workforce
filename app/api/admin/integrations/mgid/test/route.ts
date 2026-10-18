import { getAccountContext } from "@/lib/auth";
import { isPlatformSuperAdmin } from "@/lib/institutions";
import { diagnoseMgidApiAccess } from "@/lib/mgid/publisher-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function POST(request: Request) {
  // Verify the current Supabase identity and active, platform-scoped membership.
  const account = await getAccountContext();
  if (!account) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401, headers });
  if (!isPlatformSuperAdmin(account)) {
    return Response.json({ ok: false, error: "Forbidden" }, { status: 403, headers });
  }

  // Even a privileged user cannot invoke this against production, other preview
  // branches, or arbitrary deployment targets.
  if (process.env.VERCEL_ENV !== "preview" || process.env.VERCEL_GIT_COMMIT_REF !== "staging") {
    return Response.json({ ok: false, error: "Unavailable" }, { status: 404, headers });
  }

  // Explicit same-origin POST protects session-cookie authentication from CSRF.
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return Response.json({ ok: false, error: "Origin rejected" }, { status: 403, headers });
  }

  const result = await diagnoseMgidApiAccess({
    clientId: process.env.MGID_CLIENT_API_ID,
    token: process.env.MGID_CLIENT_API_TOKEN,
  });

  const status = result.ok || result.advertiserProbe?.outcome === "authenticated" ? 200 :
    result.outcome === "missing_configuration" || result.outcome === "invalid_configuration" ? 503 :
    result.outcome === "timed_out" ? 504 : 502;

  // Never forward the API token, upstream body, account IDs, financial metrics,
  // response headers, or third-party error descriptions to clients.
  return Response.json(result, { status, headers });
}
