import { requireEmployerContext } from "@/lib/employer/auth";
import { createEmployerJob, listEmployerJobs } from "@/lib/employer/job-listings-repository";
import { jsonError } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const employerId = new URL(request.url).searchParams.get("employerId");
    const context = await requireEmployerContext({ employerId, approved: true });
    return Response.json({ jobs: await listEmployerJobs(context) }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const employerId = new URL(request.url).searchParams.get("employerId");
    const context = await requireEmployerContext({ employerId, approved: true });
    const input: unknown = await request.json();
    const job = await createEmployerJob(context, input);
    return Response.json({ job }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof Error && error.message !== "Unexpected server error" && !("code" in error))) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return jsonError(error);
  }
}
