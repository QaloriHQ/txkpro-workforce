import { requireEmployerContext } from "@/lib/employer/auth";
import { finalizeEmployerLearningMedia } from "@/lib/employer/learning-repository";
import { jsonError } from "@/lib/http";

type RouteContext = { params: Promise<{ mediaId: string }> };

export async function POST(_request: Request, routeContext: RouteContext) {
  try {
    const { mediaId } = await routeContext.params;
    const context = await requireEmployerContext({ approved: true });
    const asset = await finalizeEmployerLearningMedia(
      context,
      decodeURIComponent(mediaId),
    );
    const encoded = encodeURIComponent(asset.mediaAssetId);
    return Response.json({
      ok: true,
      asset: {
        ...asset,
        contentUrl: `/api/employer/learning/media/${encoded}/content`,
        downloadUrl: `/api/employer/learning/media/${encoded}/content?download=1`,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
