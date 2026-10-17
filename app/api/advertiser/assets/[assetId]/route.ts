import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(_:Request,{params}:{params:Promise<{assetId:string}>}){
  const {assetId}=await params;const supabase=await createServerSupabaseClient();const access=await supabase.rpc("advertiser_asset_access",{p_asset_id:assetId});
  if(access.error||!access.data)return new Response("Not found",{status:404});
  const signed=await createAdminClient().storage.from(access.data.bucket).createSignedUrl(access.data.path,300);
  if(signed.error||!signed.data)return new Response("Not found",{status:404});
  return Response.redirect(signed.data.signedUrl,307);
}
