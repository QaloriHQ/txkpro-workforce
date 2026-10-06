import { completeConnect } from "@/lib/rewards/server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const u = new URL(request.url);
  try {
    const path = await completeConnect(
      u.searchParams.get("code") || "",
      u.searchParams.get("state") || "",
    );
    return Response.redirect(new URL(path, u.origin), 303);
  } catch {
    return new Response(
      "Sandbox connection could not be completed. Return to your incentive workspace and reconnect.",
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      },
    );
  }
}
