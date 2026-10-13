import { submitCommunityReport } from "@/lib/community/moderation-repository";
import { jsonError } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (!["post", "comment", "user"].includes(body.targetType) || typeof body.targetId !== "string" || typeof body.reason !== "string")
      return Response.json({ error: "Invalid report." }, { status: 400 });
    return Response.json(await submitCommunityReport({ targetType: body.targetType, targetId: body.targetId, reason: body.reason, details: typeof body.details === "string" ? body.details : undefined }));
  } catch (error) { return jsonError(error); }
}
