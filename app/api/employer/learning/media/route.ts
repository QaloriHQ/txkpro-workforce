import { requireEmployerContext } from "@/lib/employer/auth";
import {
  finalizeEmployerLearningMediaDelete,
  guardEmployerLearningMediaDelete,
  listEmployerLearningMedia,
  reserveEmployerLearningMedia,
} from "@/lib/employer/learning-repository";
import type {
  EmployerLearningMediaKind,
  EmployerLearningMediaReserveInput,
} from "@/lib/employer/learning-types";
import { jsonError } from "@/lib/http";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function stableAssetUrls(mediaAssetId: string) {
  const encoded = encodeURIComponent(mediaAssetId);
  return {
    contentUrl: `/api/employer/learning/media/${encoded}/content`,
    downloadUrl: `/api/employer/learning/media/${encoded}/content?download=1`,
  };
}

export async function GET() {
  try {
    const context = await requireEmployerContext({ approved: true });
    const assets = await listEmployerLearningMedia(context);
    return Response.json({
      assets: assets.map((asset) => ({
        ...asset,
        ...stableAssetUrls(asset.mediaAssetId),
      })),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireEmployerContext({ approved: true });
    const body = (await request.json()) as {
      filename?: string;
      displayName?: string | null;
      mediaKind?: EmployerLearningMediaKind;
      mimeType?: string;
      sizeBytes?: number;
      metadata?: Record<string, unknown>;
    };

    const input: EmployerLearningMediaReserveInput = {
      filename: String(body.filename ?? "").trim(),
      displayName: body.displayName ?? null,
      mediaKind: String(body.mediaKind ?? "") as EmployerLearningMediaKind,
      mimeType: String(body.mimeType ?? "").trim().toLowerCase(),
      sizeBytes: Number(body.sizeBytes ?? 0),
      metadata: body.metadata ?? {},
    };

    const asset = await reserveEmployerLearningMedia(context, input);
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.storage
      .from(asset.bucketId)
      .createSignedUploadUrl(asset.storagePath, { upsert: false });

    if (error || !data?.token) {
      try {
        await guardEmployerLearningMediaDelete(context, asset.mediaAssetId);
        await finalizeEmployerLearningMediaDelete(context, asset.mediaAssetId);
      } catch {
        // Keep the original Storage error as the user-visible failure.
      }
      throw new Error(error?.message ?? "Unable to create media upload token.");
    }

    return Response.json(
      {
        asset: {
          ...asset,
          ...stableAssetUrls(asset.mediaAssetId),
        },
        upload: {
          bucketId: asset.bucketId,
          storagePath: asset.storagePath,
          token: data.token,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
