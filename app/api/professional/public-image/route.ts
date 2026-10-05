import { createAdminClient } from "@/lib/supabase/admin";
import { imageResponse, customizationFailure } from "@/lib/professional-profile/customization";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { const url = new URL(request.url); const { data, error } = await createAdminClient().rpc("professional_public_image", { p_path: url.searchParams.get("path"), p_slot: url.searchParams.get("slot") }); if (error) throw new Response("Image temporarily unavailable.", { status: 503 }); return await imageResponse(data); }
  catch (e) { return customizationFailure(e); }
}
