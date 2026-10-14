import { submitModerationAppeal } from "@/lib/community/moderation-repository";
import { jsonError } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body.caseId !== "string" || typeof body.statement !== "string") return Response.json({ error: "Invalid appeal." }, { status: 400 });
    return Response.json(await submitModerationAppeal(body.caseId, body.statement));
  } catch (error) { return jsonError(error); }
}
