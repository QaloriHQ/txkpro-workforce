import { markConversationRead } from "@/lib/community/messaging-repository";
export const dynamic="force-dynamic";const headers={"Cache-Control":"private, no-store"};
export async function POST(_:Request,{params}:{params:Promise<{conversationId:string}>}){try{return Response.json(await markConversationRead((await params).conversationId),{headers});}catch(error){return error instanceof Response?error:Response.json({error:"Read state could not be updated."},{status:503,headers});}}
