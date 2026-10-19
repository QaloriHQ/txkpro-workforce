import { finishConnection } from "@/lib/checkr/oauth";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const origin = "https://staging-workforce.txkpro.com";
  const url = new URL(request.url);
  if (url.origin !== origin || process.env.CHECKR_SANDBOX_APP_ORIGIN !== origin)
    return new Response("Sandbox only", { status: 403 });
  let status = "connected";
  let employerId = "";
  try {
    employerId = await finishConnection(url.searchParams.get("code") || "", url.searchParams.get("state") || "");
  } catch { status = "retry"; }
  return new Response(null, { status: 303, headers: {
    Location: `${origin}/employer/checkr?${new URLSearchParams({ connection: status, employer: employerId })}`,
    "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer",
  } });
}
