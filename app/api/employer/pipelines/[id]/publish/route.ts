import { requireEmployerContext } from "@/lib/employer/auth";
import { publishEmployerPipeline } from "@/lib/employer/ats-pipelines-repository";
import { jsonError } from "@/lib/http";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireEmployerContext({ employerId: new URL(request.url).searchParams.get("employerId"), approved: true });
    const { revision } = await request.json() as { revision?: number };
    if (!Number.isSafeInteger(revision) || !revision || revision < 1) return Response.json({ error: "Expected revision required" }, { status: 400 });
    const version = await publishEmployerPipeline(context, (await params).id, revision);
    return Response.json({ version }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof Error && !("code" in error))) return Response.json({ error: (error as Error).message }, { status: 400 });
    return jsonError(error);
  }
}
