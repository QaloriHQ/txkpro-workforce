import { requireEmployerContext } from "@/lib/employer/auth";
import { archiveEmployerJob, getEmployerJob, updateEmployerJob } from "@/lib/employer/job-listings-repository";
import { jsonError } from "@/lib/http";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const employerId = new URL(request.url).searchParams.get("employerId");
    const context = await requireEmployerContext({ employerId, approved: true });
    return Response.json({ job: await getEmployerJob(context, id) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return jsonError(error); }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const employerId = new URL(request.url).searchParams.get("employerId");
    const context = await requireEmployerContext({ employerId, approved: true });
    const body = await request.json() as { revision?: unknown; fields?: unknown; action?: unknown };
    if (!Number.isSafeInteger(body.revision) || Number(body.revision) < 1) {
      return Response.json({ error: "A valid expected revision is required" }, { status: 400 });
    }
    if (body.action === "archive") {
      if (body.fields !== undefined) return Response.json({ error: "Archive does not accept edits" }, { status: 400 });
      return Response.json({ job: await archiveEmployerJob(context, id, Number(body.revision)) });
    }
    if (body.action !== undefined) return Response.json({ error: "Invalid job action" }, { status: 400 });
    return Response.json({ job: await updateEmployerJob(context, id, Number(body.revision), body.fields) });
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof Error && !("code" in error) && !(error instanceof Response))) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return jsonError(error);
  }
}
