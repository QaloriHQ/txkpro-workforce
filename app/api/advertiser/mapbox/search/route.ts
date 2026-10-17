import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request:Request){
  const url=new URL(request.url);const advertiserId=url.searchParams.get("advertiserId")??"";const query=(url.searchParams.get("q")??"").trim();
  if(query.length<2||query.length>120)return Response.json({error:"Enter a neighborhood name."},{status:400});
  const supabase=await createServerSupabaseClient();const access=await supabase.rpc("advertiser_manager_context",{p_advertiser_id:advertiserId});
  if(access.error)return Response.json({error:"Advertiser access is required."},{status:403});
  const token=process.env.MAPBOX_ACCESS_TOKEN;if(!token)return Response.json({error:"Mapbox is not configured for this environment."},{status:503});
  const endpoint=new URL("https://api.mapbox.com/search/geocode/v6/forward");endpoint.searchParams.set("q",query);endpoint.searchParams.set("access_token",token);endpoint.searchParams.set("types","neighborhood,locality,place,postcode");endpoint.searchParams.set("limit","5");endpoint.searchParams.set("country","us");endpoint.searchParams.set("permanent","true");
  const response=await fetch(endpoint,{headers:{accept:"application/json"},cache:"no-store"});if(!response.ok)return Response.json({error:"Neighborhood search is temporarily unavailable."},{status:502});
  const result=await response.json() as {features?:Array<{id:string;geometry:{coordinates:[number,number]};properties:{mapbox_id?:string;full_address?:string;name?:string;place_formatted?:string}}>};
  return Response.json({results:(result.features??[]).map(item=>({id:item.properties.mapbox_id??item.id,label:item.properties.full_address??[item.properties.name,item.properties.place_formatted].filter(Boolean).join(", "),longitude:item.geometry.coordinates[0],latitude:item.geometry.coordinates[1]}))},{headers:{"cache-control":"private, no-store"}});
}
