import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    await requireRole(["admin"]);
  } catch (error) {
    if (error instanceof Response) {
      return Response.json(
        { ok: false, error: error.status === 401 ? "Unauthorized" : "Forbidden" },
        { status: error.status, headers: noStore },
      );
    }
    return Response.json({ ok: false, error: "Authorization failed" }, { status: 500, headers: noStore });
  }

  // This diagnostic is intentionally unavailable in production or other previews.
  if (process.env.VERCEL_ENV !== "preview" || process.env.VERCEL_GIT_COMMIT_REF !== "staging") {
    return Response.json({ ok: false, error: "Unavailable" }, { status: 404, headers: noStore });
  }

  const key = process.env.TREMENDOUS_SANDBOX_API_KEY;
  if (!key || !key.startsWith("TEST_")) {
    return Response.json(
      { ok: false, error: "Sandbox key is not configured" },
      { status: 503, headers: noStore },
    );
  }

  try {
    const upstream = await fetch("https://testflight.tremendous.com/api/v2/ping", {
      method: "GET",
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });

    // Do not return the key, upstream body, or organization details.
    return Response.json(
      upstream.ok
        ? { ok: true, provider: "tremendous", environment: "sandbox" }
        : { ok: false, error: "Tremendous sandbox authentication or request failed", upstreamStatus: upstream.status },
      { status: upstream.ok ? 200 : 502, headers: noStore },
    );
  } catch {
    return Response.json(
      { ok: false, error: "Tremendous sandbox is unreachable" },
      { status: 502, headers: noStore },
    );
  }
}
