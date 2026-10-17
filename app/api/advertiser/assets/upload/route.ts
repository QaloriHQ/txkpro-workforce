import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const types:Record<string,{extension:string;mediaType:"image"|"video";max:number}> = {
  "image/jpeg":{extension:"jpg",mediaType:"image",max:10*1024*1024},
  "image/png":{extension:"png",mediaType:"image",max:10*1024*1024},
  "image/webp":{extension:"webp",mediaType:"image",max:10*1024*1024},
  "video/mp4":{extension:"mp4",mediaType:"video",max:100*1024*1024},
  "video/webm":{extension:"webm",mediaType:"video",max:100*1024*1024},
};

export async function POST(request:Request){
  const body=await request.json() as {advertiserId?:string;mimeType?:string;byteSize?:number};
  const advertiserId=String(body.advertiserId??"");const mimeType=String(body.mimeType??"");const byteSize=Number(body.byteSize??0);const kind=types[mimeType];
  if(!kind||!Number.isSafeInteger(byteSize)||byteSize<1||byteSize>kind.max)return Response.json({error:kind?`Maximum ${kind.mediaType} size is ${kind.max/1024/1024} MB.`:"Use JPEG, PNG, WebP, MP4, or WebM."},{status:400});
  const supabase=await createServerSupabaseClient();const access=await supabase.rpc("advertiser_manager_context",{p_advertiser_id:advertiserId});
  if(access.error)return Response.json({error:"Advertiser access is required."},{status:403});
  const path=`${advertiserId}/${randomUUID()}.${kind.extension}`;const signed=await createAdminClient().storage.from("ad-assets").createSignedUploadUrl(path);
  if(signed.error||!signed.data)return Response.json({error:"Upload could not be prepared."},{status:503});
  return Response.json({path,token:signed.data.token,mediaType:kind.mediaType},{headers:{"cache-control":"private, no-store"}});
}
