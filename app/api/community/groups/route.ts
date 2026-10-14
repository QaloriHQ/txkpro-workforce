import {createGroup,listGroups} from "@/lib/community/group-repository"; export const dynamic="force-dynamic"; const h={"Cache-Control":"private, no-store"};
const fail=async(e:unknown)=>Response.json({error:e instanceof Response?await e.text():"Groups are temporarily unavailable."},{status:e instanceof Response?e.status:503,headers:h});
export async function GET(r:Request){try{const s=new URL(r.url).searchParams.get("scope")==="mine"?"mine":"discover";return Response.json(await listGroups(s),{headers:h});}catch(e){return fail(e)}}
export async function POST(r:Request){try{const x=await r.json();if(!x||typeof x.name!=="string")return Response.json({error:"Invalid group."},{status:400,headers:h});return Response.json(await createGroup(x),{status:201,headers:h});}catch(e){return fail(e)}}
