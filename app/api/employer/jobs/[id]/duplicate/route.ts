import { requireEmployerContext } from "@/lib/employer/auth";
import { duplicateEmployerJob } from "@/lib/employer/job-listings-repository";
import { jsonError } from "@/lib/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const employerId = new URL(request.url).searchParams.get("employerId");
    const context = await requireEmployerContext({ employerId, approved: true });
    return Response.json({ job: await duplicateEmployerJob(context, id) }, { status: 201 });
  } catch (error) { return jsonError(error); }
}
