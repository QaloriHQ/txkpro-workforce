import { requireEmployerContext } from "@/lib/employer/auth";
import { duplicateEmployerPipeline } from "@/lib/employer/ats-pipelines-repository";
import { jsonError } from "@/lib/http";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireEmployerContext({ employerId: new URL(request.url).searchParams.get("employerId"), approved: true });
    return Response.json({ pipeline: await duplicateEmployerPipeline(context, (await params).id) }, { status: 201 });
  } catch (error) { return jsonError(error); }
}
