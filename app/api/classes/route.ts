import { createHash,randomBytes } from "node:crypto";
import QRCode from "qrcode";
import { getPublicAppOrigin } from "@/lib/site-url";
import { classRpc } from "@/lib/classes/server";
import { classError, boundedRequest } from "@/lib/classes/request";
export async function GET() { try { return Response.json({data:await classRpc("class_workspace")},{headers:{"Cache-Control":"private, no-store"}}); } catch(e) {return classError(e);} }
export async function POST(request:Request) {
 try {
  if (Number(request.headers.get("content-length") ?? 0)>20000) throw new Response("Request too large",{status:413});
  const body=await (await boundedRequest(request)).json();
  let data:unknown;
  if (body.action==="save") data=await classRpc("class_save",{p_input:body.input});
  else if (body.action==="instructor") data=await classRpc("class_instructor_assign",{p_class:body.classId,p_user:body.userId,p_remove:body.remove===true});
  else if (body.action==="cohortDate") data=await classRpc("cohort_start_date",{p_cohort:body.cohortId,p_date:body.startDate||null});
  else if (body.action==="enrollment") data=await classRpc("class_enrollment_update",{p_class:body.classId,p_user:body.userId,p_status:body.status});
  else if (body.action==="revokeLink") data=await classRpc("class_link",{p_class:body.classId,p_link:body.linkId});
  else if (body.action==="link") {
   const token=randomBytes(32).toString("hex");
   const result=await classRpc<Record<string,unknown>>("class_link",{p_class:body.classId,p_token_hash:createHash("sha256").update(token).digest("hex")});
   const url=getPublicAppOrigin()+`/classes/join?token=${token}`;
   data={...result,url,qr:await QRCode.toDataURL(url,{width:240,margin:2})};
  } else throw new Response("Invalid action",{status:400});
  return Response.json({data},{headers:{"Cache-Control":"private, no-store"}});
 } catch(e) {return classError(e);}
}
