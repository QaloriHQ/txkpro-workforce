import { messagingInbox } from "@/lib/community/messaging-repository";
export const dynamic="force-dynamic";const headers={"Cache-Control":"private, no-store"};
export async function GET(){try{return Response.json(await messagingInbox(),{headers});}catch(error){return error instanceof Response?error:Response.json({error:"Messaging is temporarily unavailable."},{status:503,headers});}}
