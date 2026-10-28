import { classError } from "@/lib/classes/request";
import { rewardWorkspace } from "@/lib/rewards/server";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const data = await rewardWorkspace();
    const request = data.requests.find((r) => r.id === id);
    if (!request)
      return Response.json(
        { error: "Redemption unavailable" },
        { status: 404 },
      );
    return Response.json(request, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return classError(e);
  }
}
