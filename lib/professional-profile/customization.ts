import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Kind, Customization } from "./types";
export const imageBucket = "professional-profile";
export const privateHeaders = { "Cache-Control": "private, no-store" };
export async function ownerRpc<T>(name: string, args: Record<string, unknown>) {
  const client = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) throw new Response("Sign in required.", { status: 401 });
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Response(error.code === "42501" ? "Profile ownership required." : error.code === "22023" ? error.message : "Profile customization temporarily unavailable.", { status: error.code === "42501" ? 403 : error.code === "22023" ? 400 : 503 });
  return data as T;
}
export function customize(kind: Kind, input: Record<string, unknown> | null = null) { return ownerRpc<Customization>("professional_customization", { p_kind: kind, p_input: input }); }
export function requestKind(request: Request): Kind { const kind = new URL(request.url).searchParams.get("kind"); if (kind !== "educator" && kind !== "staff") throw new Response("Choose Educator or Staff.", { status: 400 }); return kind; }
export async function customizationFailure(e: unknown) { return Response.json({ error: e instanceof Response ? await e.text() : "Profile customization temporarily unavailable." }, { status: e instanceof Response ? e.status : 503, headers: privateHeaders }); }
export async function imageResponse(path: string | null) {
  if (!path) throw new Response("Image unavailable.", { status: 404 });
  const { data, error } = await createAdminClient().storage.from(imageBucket).download(path);
  if (error || !data || !["image/jpeg", "image/png", "image/webp"].includes(data.type)) throw new Response("Image unavailable.", { status: 404 });
  return new Response(data, { headers: { ...privateHeaders, "Content-Type": data.type, "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline", "Content-Security-Policy": "sandbox; default-src 'none'", "Cross-Origin-Resource-Policy": "same-origin" } });
}
