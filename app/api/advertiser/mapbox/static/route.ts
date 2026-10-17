import { createServerSupabaseClient } from "@/lib/supabase/server";

function circle(longitude:number,latitude:number,radiusM:number){const points=[];const earth=6378137;for(let i=0;i<=48;i++){const angle=i/48*Math.PI*2;const dLat=radiusM/earth*Math.sin(angle);const dLon=radiusM/(earth*Math.cos(latitude*Math.PI/180))*Math.cos(angle);points.push([longitude+dLon*180/Math.PI,latitude+dLat*180/Math.PI]);}return {type:"Feature",properties:{stroke:"#0969da","stroke-width":3,"fill":"#0969da","fill-opacity":0.16},geometry:{type:"Polygon",coordinates:[points]}};}
export async function GET(request:Request){
  const url=new URL(request.url);const advertiserId=url.searchParams.get("advertiserId")??"";const longitude=Number(url.searchParams.get("longitude"));const latitude=Number(url.searchParams.get("latitude"));const radiusM=Number(url.searchParams.get("radiusM"));
  if(!Number.isFinite(longitude)||!Number.isFinite(latitude)||!Number.isFinite(radiusM)||longitude< -180||longitude>180||latitude< -90||latitude>90||radiusM<500||radiusM>50000)return new Response("Invalid map",{status:400});
  const supabase=await createServerSupabaseClient();const access=await supabase.rpc("advertiser_manager_context",{p_advertiser_id:advertiserId});if(access.error)return new Response("Forbidden",{status:403});
  const token=process.env.MAPBOX_ACCESS_TOKEN;if(!token)return new Response("Mapbox is not configured",{status:503});
  const overlay=`geojson(${encodeURIComponent(JSON.stringify(circle(longitude,latitude,radiusM)))})`;const endpoint=`https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${overlay}/${longitude},${latitude},12/960x520@2x?access_token=${encodeURIComponent(token)}&attribution=true&logo=true`;
  const image=await fetch(endpoint,{cache:"no-store"});if(!image.ok)return new Response("Map unavailable",{status:502});return new Response(image.body,{headers:{"content-type":image.headers.get("content-type")??"image/png","cache-control":"private, max-age=300","x-content-type-options":"nosniff"}});
}
