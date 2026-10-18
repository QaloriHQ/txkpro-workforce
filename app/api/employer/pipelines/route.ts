import { requireEmployerContext } from "@/lib/employer/auth";
import { createEmployerPipeline, listEmployerPipelines } from "@/lib/employer/ats-pipelines-repository";
import { jsonError } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const employerId = new URL(request.url).searchParams.get("employerId");
    const context = await requireEmployerContext({ employerId, approved: true });
    return Response.json(await listEmployerPipelines(context), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return jsonError(error); }
}
export async function POST(request: Request) {
  try {
    const employerId = new URL(request.url).searchParams.get("employerId");
    const context = await requireEmployerContext({ employerId, approved: true });
    const pipeline = await createEmployerPipeline(context, await request.json());
    return Response.json({ pipeline }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof Error && !("code" in error))) {
      return Response.json({ error: (error as Error).message }, { status: 400 });
    }
    return jsonError(error);
  }
}
