import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { absolutePublicUrl } from "@/lib/public/seo";
import { COMMUNITY_IMAGE_MAX_BYTES, detectedCommunityImageType } from "@/lib/community/image-validation";
import { deleteStudentMedia, registerStudentMedia } from "@/lib/community/student-composer-repository";

export const dynamic = "force-dynamic";

async function readLimitedBody(request: Request) {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > COMMUNITY_IMAGE_MAX_BYTES) {
      await reader.cancel();
      throw new Response("Choose an image up to 8 MB.", { status: 413 });
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export async function POST(request: Request) {
  let assetId = "";
  try {
    const draftId = request.headers.get("x-community-draft-id") || "";
    const altText = (request.headers.get("x-community-alt") || "").slice(0, 300);
    const declaredSize = Number(request.headers.get("content-length") || 0);
    if (!draftId || declaredSize > COMMUNITY_IMAGE_MAX_BYTES) return Response.json({ error: "Choose an image up to 8 MB." }, { status: 400 });
    const bytes = await readLimitedBody(request);
    if (!bytes.length) return Response.json({ error: "Choose an image to upload." }, { status: 400 });
    const mimeType = detectedCommunityImageType(bytes);
    if (!mimeType) return Response.json({ error: "Use a JPEG, PNG, WebP, or GIF image." }, { status: 415 });

    const id = randomUUID();
    const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1];
    const storagePath = `drafts/${draftId}/${id}.${extension}`;
    const publicUrl = absolutePublicUrl(`/api/community/media/${id}`);
    const asset = await registerStudentMedia({ assetId: id, draftId, storagePath, publicUrl, mimeType, byteSize: bytes.length, altText });
    assetId = asset.id;
    const { error } = await createAdminClient().storage.from("community-media").upload(storagePath, bytes, { contentType: mimeType, upsert: false });
    if (error) throw new Error(error.message);
    return Response.json({ ...asset, url: `/api/community/media/${id}` }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (assetId) await deleteStudentMedia(assetId).catch(() => undefined);
    return Response.json({ error: error instanceof Response ? await error.text() : "The image could not be uploaded." }, { status: error instanceof Response ? error.status : 400 });
  }
}
