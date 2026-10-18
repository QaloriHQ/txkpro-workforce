import { requireEmployerContext } from "@/lib/employer/auth";
import { publishEmployerJob } from "@/lib/employer/job-listings-repository";
import { jsonError } from "@/lib/http";

// The SQL publication RPC atomically verifies employer scope, job revision,
// selected published version and curated public projection.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const context = await requireEmployerContext({
      employerId: new URL(request.url).searchParams.get("employerId"),
      approved: true,
    });
    const body = await request.json() as { revision?: unknown; pipelineVersionId?: unknown };
    if (typeof body.revision !== "number" || !Number.isSafeInteger(body.revision) || body.revision < 1 ||
        typeof body.pipelineVersionId !== "string" ||
        !/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(body.pipelineVersionId)) {
      return Response.json({ error: "Valid revision and published pipeline version required" }, { status: 400 });
    }
    const job = await publishEmployerJob(context, id, body.revision, body.pipelineVersionId);
    return Response.json({ job }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: "Invalid request body" }, { status: 400 });
    return jsonError(error);
  }
}
