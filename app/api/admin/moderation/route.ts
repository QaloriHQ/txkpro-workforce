import { requireRole } from "@/lib/auth";
import { moderationQueue } from "@/lib/community/moderation-repository";
import type { ModerationSeverity, ModerationStatus } from "@/lib/community/moderation-types";
import { jsonError } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await requireRole(["admin"]);
    const params = new URL(request.url).searchParams;
    return Response.json(await moderationQueue({ status: (params.get("status") || undefined) as ModerationStatus | undefined, severity: (params.get("severity") || undefined) as ModerationSeverity | undefined }));
  } catch (error) { return jsonError(error); }
}
