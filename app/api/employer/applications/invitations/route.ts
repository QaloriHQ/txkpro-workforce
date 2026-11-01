import { createCandidateInvitation } from "@/lib/ats/applications-repository";
import { requireEmployerContext } from "@/lib/employer/auth";
import { jsonError } from "@/lib/http";

export async function POST(request:Request){
  try{
    const context=await requireEmployerContext({employerId:new URL(request.url).searchParams.get("employerId"),approved:true});
    const body=await request.json() as {jobId?:unknown;email?:unknown;studentId?:unknown};
    if(typeof body.jobId!=="string"||typeof body.email!=="string")return Response.json({error:"Job and candidate email are required."},{status:400});
    const invitation=await createCandidateInvitation(context,{jobId:body.jobId,email:body.email,studentId:typeof body.studentId==="string"?body.studentId:null});
    return Response.json({invitation},{status:201,headers:{"Cache-Control":"private, no-store"}});
  }catch(error){if(error instanceof SyntaxError)return Response.json({error:"Invalid request body."},{status:400});return jsonError(error);}
}
