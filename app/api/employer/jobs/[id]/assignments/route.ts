import { boundedRequest, classError } from "@/lib/classes/request";
import { requireEmployerContext } from "@/lib/employer/auth";
import { replaceJobWorkspaceAssignments } from "@/lib/employer/job-workspace";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Origin denied" }, { status: 403 });
    const employerId = new URL(request.url).searchParams.get("employerId");
    const context = await requireEmployerContext({ employerId, approved: true });
    const { id } = await params;
    const body = await (await boundedRequest(request, 32000)).json() as { hiringTeamUserIds?: unknown; crewIds?: unknown };
    if (!Array.isArray(body.hiringTeamUserIds) || !Array.isArray(body.crewIds) ||
      body.hiringTeamUserIds.some((value) => typeof value !== "string") || body.crewIds.some((value) => typeof value !== "string")) {
      return Response.json({ error: "Hiring team and crew selections are required" }, { status: 400 });
    }
    const workspace = await replaceJobWorkspaceAssignments({ employerId: context.employerId, jobId: id, hiringTeamUserIds: body.hiringTeamUserIds as string[], crewIds: body.crewIds as string[] });
    return Response.json({ workspace }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return classError(error);
  }
}
