import { redactDirectMessage } from "@/lib/community/messaging-repository";
export const dynamic="force-dynamic";const headers={"Cache-Control":"private, no-store"};
export async function DELETE(_:Request,{params}:{params:Promise<{messageId:string}>}){try{return Response.json(await redactDirectMessage((await params).messageId),{headers});}catch(error){return error instanceof Response?error:Response.json({error:"The message could not be removed."},{status:503,headers});}}
