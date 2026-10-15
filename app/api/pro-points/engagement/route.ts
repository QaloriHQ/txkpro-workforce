import { classError } from "@/lib/classes/request";
import { engagementPointsSummary } from "@/lib/pro-points/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await engagementPointsSummary(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return classError(error);
  }
}
