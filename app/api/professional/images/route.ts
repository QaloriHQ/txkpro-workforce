import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { validatePortfolioFile } from "@/lib/student-portfolio/file-validation";
import { customize, ownerRpc, imageBucket, imageResponse, customizationFailure, privateHeaders, requestKind } from "@/lib/professional-profile/customization";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { return await imageResponse(await ownerRpc<string | null>("professional_owner_image", { p_kind: requestKind(request), p_slot: new URL(request.url).searchParams.get("slot") })); }
  catch (e) { return customizationFailure(e); }
}
export async function POST(request: Request) {
  let uploaded: string | null = null;
  try {
    const kind = requestKind(request); const owner = await customize(kind);
    if (!owner.pageId) throw new Response("Save your profile before uploading images.", { status: 400 });
    const reader = request.body?.getReader(); if (!reader) throw new Response("Choose an image.", { status: 400 });
    const chunks: Uint8Array[] = []; let total = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; total += value.length; if (total > 4 * 1024 * 1024 + 65536) { await reader.cancel(); throw new Response("Maximum image size is 4 MB.", { status: 413 }); } chunks.push(value); }
    const body = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
    const form = await new Request(request.url, { method: "POST", headers: { "Content-Type": request.headers.get("Content-Type") || "" }, body }).formData();
    const file = form.get("file"); const slot = String(form.get("slot"));
    if (!(file instanceof File) || !["photo", "cover"].includes(slot)) throw new Response("Choose a photo or cover image.", { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    try { if (bytes.length > 4 * 1024 * 1024) throw new Error("Maximum image size is 4 MB."); validatePortfolioFile(bytes, file.type, slot); } catch (e) { throw new Response(e instanceof Error ? e.message : "Invalid image.", { status: 400 }); }
    const old = await ownerRpc<string | null>("professional_owner_image", { p_kind: kind, p_slot: slot });
    const path = `${owner.pageId}/${randomUUID()}`; const admin = createAdminClient();
    const { error } = await admin.storage.from(imageBucket).upload(path, bytes, { contentType: file.type, upsert: false });
    if (error) throw new Response("Upload failed. Try again.", { status: 503 });
    uploaded = path; const result = await customize(kind, { op: "image", slot, storagePath: path }); uploaded = null;
    const cleanup = old ? await admin.storage.from(imageBucket).remove([old]) : null;
    return Response.json({ ...result, cleanupPending: Boolean(cleanup?.error) }, { headers: privateHeaders });
  } catch (e) { if (uploaded) await createAdminClient().storage.from(imageBucket).remove([uploaded]); return customizationFailure(e); }
}
export async function DELETE(request: Request) {
  try { const kind = requestKind(request); const slot = new URL(request.url).searchParams.get("slot");
    const old = await ownerRpc<string | null>("professional_owner_image", { p_kind: kind, p_slot: slot });
    const result = await customize(kind, { op: "remove_image", slot });
    const cleanup = old ? await createAdminClient().storage.from(imageBucket).remove([old]) : null;
    return Response.json({ ...result, cleanupPending: Boolean(cleanup?.error) }, { headers: privateHeaders });
  } catch (e) { return customizationFailure(e); }
}
