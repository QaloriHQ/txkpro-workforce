import { requireStudentContext } from "@/lib/student/auth";
import { authorizeStudentEmployerTrainingMedia } from "@/lib/student/learning-repository";
import { jsonError } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = {
  params: Promise<{ assignmentId: string; mediaId: string }>;
};

export async function GET(request: Request, routeContext: RouteContext) {
  try {
    await requireStudentContext();
    const { assignmentId, mediaId } = await routeContext.params;
    const asset = await authorizeStudentEmployerTrainingMedia(
      decodeURIComponent(assignmentId),
      decodeURIComponent(mediaId),
    );
    const download = new URL(request.url).searchParams.get("download") === "1";

    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from(asset.bucketId)
      .createSignedUrl(
        asset.storagePath,
        900,
        download ? { download: asset.originalFilename } : undefined,
      );

    if (error || !data?.signedUrl) {
      throw new Error(error?.message ?? "Unable to sign Student media URL.");
    }

    return Response.redirect(data.signedUrl, 302);
  } catch (error) {
    return jsonError(error);
  }
}
