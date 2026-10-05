import {createHash} from "node:crypto";
import {classRpc} from "@/lib/classes/server";
import {acceptUserInvitation} from "@/lib/invitations/service";
import { classError, boundedRequest } from "@/lib/classes/request";
export async function POST(request:Request) {try {
 const body=await (await boundedRequest(request)).json(); let data:unknown;
 if(body.action==="claim" && typeof body.token==="string" && /^[a-f0-9]{64}$/.test(body.token)) data=await classRpc("class_qr_claim",{p_hash:createHash("sha256").update(body.token).digest("hex")});
 else if(body.action==="accept") data=await acceptUserInvitation(String(body.invitationId));
 else if(body.action==="decline") data=await classRpc("class_invitation_decline",{p_invitation:String(body.invitationId)});
 else throw new Response("Invalid action",{status:400});
 return Response.json({data},{headers:{"Cache-Control":"private, no-store"}});
}catch(e){return classError(e);}}
