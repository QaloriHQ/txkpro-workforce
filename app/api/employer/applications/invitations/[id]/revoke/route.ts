import { revokeCandidateInvitation } from "@/lib/ats/applications-repository";
import { requireEmployerContext } from "@/lib/employer/auth";
import { jsonError } from "@/lib/http";

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{const{id}=await params;const context=await requireEmployerContext({employerId:new URL(request.url).searchParams.get("employerId"),approved:true});const body=await request.json() as {reason?:unknown};if(typeof body.reason!=="string")return Response.json({error:"Revocation reason is required."},{status:400});return Response.json({invitation:await revokeCandidateInvitation(context,id,body.reason)},{headers:{"Cache-Control":"private, no-store"}});}catch(error){return jsonError(error);}}
