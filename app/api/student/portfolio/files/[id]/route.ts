import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  noStore,
  portfolioBucket,
  portfolioFailure,
  portfolioRpc,
  studentPortfolio,
} from "@/lib/student-portfolio/repository";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };
type AuthorizedFile = {
  title: string;
  mime: string;
  storagePath: string;
  size: number;
} | null;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function GET(request: Request, { params }: Props) {
  try {
    const { id } = await params;
    if (!uuid.test(id))
      throw new Response("File unavailable.", { status: 404 });
    const url = new URL(request.url);
    const client = await createServerSupabaseClient();
    const {
      data: { user },
    } = await client.auth.getUser();
    let file: AuthorizedFile;
    if (user) {
      file = await portfolioRpc<AuthorizedFile>("student_portfolio_file", {
        p_id: id,
        p_employer: url.searchParams.get("employerId"),
        p_hiring_need: url.searchParams.get("hiringNeedId"),
      });
    } else {
      const { data, error } = await createAdminClient().rpc(
        "student_portfolio_public_file",
        { p_id: id },
      );
      if (error) throw new Response("File unavailable.", { status: 503 });
      file = data as AuthorizedFile;
    }
    if (!file) throw new Response("File unavailable.", { status: 404 });
    const { data, error } = await createAdminClient()
      .storage.from(portfolioBucket)
      .download(file.storagePath);
    if (error || !data)
      throw new Response("File unavailable.", { status: 404 });
    const extension =
      file.mime === "application/pdf"
        ? ".pdf"
        : file.mime === "text/plain"
          ? ".txt"
          : file.mime === "image/png"
            ? ".png"
            : file.mime === "image/webp"
              ? ".webp"
              : ".jpg";
    const filename =
      file.title.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 100) + extension;
    return new Response(data, {
      headers: {
        ...noStore,
        "Content-Type": file.mime,
        "Content-Disposition": `${file.mime.startsWith("image/") || url.searchParams.get("view") === "1" ? "inline" : "attachment"}; filename="${filename}"`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'",
        "Cross-Origin-Resource-Policy": "same-origin",
      },
    });
  } catch (e) {
    return portfolioFailure(e);
  }
}
export async function DELETE(_request: Request, { params }: Props) {
  try {
    const { id } = await params;
    if (!uuid.test(id))
      throw new Response("File unavailable.", { status: 404 });
    const owner = await studentPortfolio();
    if (!owner.files.some((f) => f.id === id))
      throw new Response("File unavailable.", { status: 404 });
    const result = await studentPortfolio({ op: "file_delete", id }); // revoke metadata before removing Storage object
    const { error } = await createAdminClient()
      .storage.from(portfolioBucket)
      .remove([`${owner.studentId}/${id}`]);
    return Response.json(
      { ...result, cleanupPending: Boolean(error) },
      { headers: noStore },
    );
  } catch (e) {
    return portfolioFailure(e);
  }
}
