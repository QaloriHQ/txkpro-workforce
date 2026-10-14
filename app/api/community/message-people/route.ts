import { messagePeople } from "@/lib/community/messaging-repository";
export const dynamic="force-dynamic";const headers={"Cache-Control":"private, no-store"};
export async function GET(request:Request){try{const q=new URL(request.url).searchParams.get("q")||"";if(q.length>120)return Response.json({error:"Search is too long."},{status:400,headers});return Response.json(await messagePeople(q),{headers});}catch(error){return error instanceof Response?error:Response.json({error:"People search is temporarily unavailable."},{status:503,headers});}}
