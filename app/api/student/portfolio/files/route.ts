import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  maxPortfolioFileBytes,
  validatePortfolioFile,
} from "@/lib/student-portfolio/file-validation";
import {
  noStore,
  portfolioBucket,
  portfolioFailure,
  studentPortfolio,
} from "@/lib/student-portfolio/repository";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  let uploadedPath: string | null = null;
  try {
    const portfolio = await studentPortfolio(); // Authenticate before consuming upload.
    if (!portfolio.studentId)
      throw new Response("Student membership required.", { status: 403 });
    // Enforce actual streamed bytes, including clients without/tricking Content-Length.
    const reader = request.body?.getReader();
    if (!reader) throw new Response("Choose a file.", { status: 400 });
    let total = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxPortfolioFileBytes + 65536) {
        await reader.cancel();
        throw new Response("Maximum file size is 10 MB.", { status: 413 });
      }
      chunks.push(value);
    }
    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.length;
    }
    const form = await new Request(request.url, {
      method: "POST",
      headers: { "Content-Type": request.headers.get("Content-Type") || "" },
      body,
    }).formData();
    const file = form.get("file");
    const kind = String(form.get("kind") || "document");
    const title = String(form.get("title") || "").trim();
    if (!(file instanceof File) || !title || title.length > 120)
      throw new Response("Choose a file and title (120 characters maximum).", {
        status: 400,
      });
    const bytes = new Uint8Array(await file.arrayBuffer());
    try {
      validatePortfolioFile(bytes, file.type, kind);
    } catch (e) {
      throw new Response(e instanceof Error ? e.message : "Invalid file.", {
        status: 400,
      });
    }
    const id = randomUUID();
    const path = `${portfolio.studentId}/${id}`;
    const admin = createAdminClient();
    const { error } = await admin.storage
      .from(portfolioBucket)
      .upload(path, bytes, { contentType: file.type, upsert: false });
    if (error) throw new Response("Upload failed. Try again.", { status: 503 });
    uploadedPath = path;
    const result = await studentPortfolio({
      op: "file_register",
      id,
      storagePath: path,
      title,
      kind,
      mime: file.type,
      size: bytes.length,
    });
    uploadedPath = null;
    return Response.json(result, { status: 201, headers: noStore });
  } catch (e) {
    if (uploadedPath)
      await createAdminClient()
        .storage.from(portfolioBucket)
        .remove([uploadedPath]);
    return portfolioFailure(e);
  }
}
