import { validWorkerSecret } from "@/lib/incentives/integration-contracts";
import { runIncentiveJobs } from "@/lib/incentives/jobs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: Request) {
  if (
    !validWorkerSecret(
      request.headers.get("authorization"),
      process.env.INCENTIVES_WORKER_SECRET,
    )
  )
    return Response.json(
      { error: "Worker authentication required" },
      { status: 401 },
    );
  try {
    return Response.json(await runIncentiveJobs(true), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return Response.json(
      { error: "Queue retained; worker retry required" },
      { status: 503 },
    );
  }
}
