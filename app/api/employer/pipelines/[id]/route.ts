import { requireEmployerContext } from "@/lib/employer/auth";
import { getEmployerPipeline, saveEmployerPipeline } from "@/lib/employer/ats-pipelines-repository";
import { jsonError } from "@/lib/http";
type Ctx = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Ctx) {
  try {
    const context = await requireEmployerContext({ employerId: new URL(request.url).searchParams.get("employerId"), approved: true });
    return Response.json({ pipeline: await getEmployerPipeline(context, (await params).id) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return jsonError(error); }
}
export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const context = await requireEmployerContext({ employerId: new URL(request.url).searchParams.get("employerId"), approved: true });
    const body = await request.json() as { revision?: number; fields?: unknown };
    if (!Number.isSafeInteger(body.revision) || !body.revision || body.revision < 1) {
      return Response.json({ error: "Expected revision required" }, { status: 400 });
    }
    return Response.json({ pipeline: await saveEmployerPipeline(context, (await params).id, body.revision, body.fields) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof Error && !("code" in error))) {
      return Response.json({ error: (error as Error).message }, { status: 400 });
    }
    return jsonError(error);
  }
}
