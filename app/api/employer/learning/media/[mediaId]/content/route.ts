import { requireEmployerContext } from "@/lib/employer/auth";
import { getEmployerLearningMedia } from "@/lib/employer/learning-repository";
import { jsonError } from "@/lib/http";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ mediaId: string }> };

export async function GET(request: Request, routeContext: RouteContext) {
  try {
    const { mediaId } = await routeContext.params;
    const context = await requireEmployerContext({ approved: true });
    const asset = await getEmployerLearningMedia(
      context,
      decodeURIComponent(mediaId),
    );
    const download = new URL(request.url).searchParams.get("download") === "1";
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.storage
      .from(asset.bucketId)
      .createSignedUrl(
        asset.storagePath,
        3600,
        download ? { download: asset.originalFilename } : undefined,
      );

    if (error || !data?.signedUrl) {
      throw new Error(error?.message ?? "Unable to sign media URL.");
    }

    return Response.redirect(data.signedUrl, 302);
  } catch (error) {
    return jsonError(error);
  }
}
