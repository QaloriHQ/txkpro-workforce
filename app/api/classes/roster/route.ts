import ExcelJS from "exceljs";
import { classRpc,type ClassWorkspace } from "@/lib/classes/server";
import { assertSafeXlsx,csvRows,validateRoster,type RosterRow } from "@/lib/classes/roster";
import { createAndDeliverUserInvitation } from "@/lib/invitations/service";
import { classError, boundedRequest } from "@/lib/classes/request";
export const runtime="nodejs";
export const maxDuration=60;
export async function POST(request:Request) {
 try {
  // Authenticate and resolve scope before parsing/decompressing user-supplied files.
  const workspace=await classRpc<ClassWorkspace>("class_workspace");
  if (!workspace.cohorts.some(c=>c.canManage)) throw new Response("Class management required",{status:403});
  request=await boundedRequest(request,2_100_000);
  if (Number(request.headers.get("content-length") ?? 0)>2_100_000) throw new Response("Upload limit is 2 MB",{status:413});
  if (request.headers.get("content-type")?.includes("multipart/form-data")) {
   const form=await request.formData(); const file=form.get("file"); const classId=form.get("classId");
   const selected=await classRpc<ClassWorkspace>("class_workspace",{p_class:String(classId)});
   const item=selected.classes.find(c=>c.classId===classId && c.canManage);
   if (!item) throw new Response("Class scope denied",{status:403});
   if (!(file instanceof File) || file.size>2_000_000) throw new Response("Upload CSV or XLSX up to 2 MB",{status:400});
   let rows:string[][];
   if (/\.csv$/i.test(file.name)) rows=csvRows(await file.text());
   else if (/\.xlsx$/i.test(file.name)) {
    const bytes=new Uint8Array(await file.arrayBuffer()); assertSafeXlsx(bytes);
    const workbook=new ExcelJS.Workbook(); await workbook.xlsx.load(bytes.buffer as ArrayBuffer);
    const sheet=workbook.worksheets[0]; if (!sheet || sheet.rowCount>1001 || sheet.columnCount>20) throw new Error("Workbook must contain at most 1,000 students and 20 columns.");
    rows=[]; sheet.eachRow(row=> { const cells:string[]=[]; for(let i=1;i<=sheet.columnCount;i++) { const cell=row.getCell(i); if(cell.type===ExcelJS.ValueType.Formula) throw new Error("Formula cells are not allowed."); cells.push(cell.text); } rows.push(cells); });
   } else throw new Error("Use CSV or XLSX (not XLS).");
   const data=validateRoster(rows).map(row=>checkHints(row,item.cohorts));
   return Response.json({data},{headers:{"Cache-Control":"private, no-store"}});
  }
  const body=await request.json(); const selected=await classRpc<ClassWorkspace>("class_workspace",{p_class:String(body.classId)}); const item=selected.classes.find(c=>c.classId===body.classId && c.canManage);
  if (!item || item.status!=="open") throw new Response("Open authorized class required",{status:403});
  if (!Array.isArray(body.rows) || !body.rows.length || body.rows.length>10) throw new Response("Send 1–10 invitations per batch",{status:400});
  const rows=validateRoster([["email","first_name","last_name","program","cohort"],...body.rows.map((r:Record<string,unknown>)=>[r.email,r.firstName,r.lastName,r.program,r.cohort].map(v=>typeof v==="string"?v:""))]).map(r=>checkHints(r,item.cohorts));
  if(rows.some(r=>r.error)) throw new Response("Correct invalid roster rows before sending",{status:400});
  const results=[];
  for(const row of rows) {
   try { results.push({email:row.email,ok:true,...await createAndDeliverUserInvitation({email:row.email,firstName:row.firstName,lastName:row.lastName,role:"student",scopeType:"class",scopeId:item.classId,institutionId:item.institutionId,cohortHint:row.cohort,programHint:row.program})}); }
   catch {results.push({email:row.email,ok:false,error:"Invitation could not be created. Check membership and class scope."});}
  }
  return Response.json({data:results},{headers:{"Cache-Control":"private, no-store"}});
 } catch(e) {return classError(e);}
}
function checkHints(row:RosterRow,cohorts:{cohortId:string;name:string;program:string|null}[]) {
 if(row.error) return row;
 const matches=cohorts.filter(c=>(!row.program || c.program?.toLowerCase()===row.program.toLowerCase())&&(!row.cohort || c.cohortId===row.cohort || c.name.toLowerCase()===row.cohort.toLowerCase()));
 if((row.program || row.cohort) && !matches.length) return {...row,error:"Program/cohort does not match this class"};
 if(row.cohort && matches.length!==1) return {...row,error:"Ambiguous cohort; use cohort ID"};
 return {...row,cohort:row.cohort?matches[0].cohortId:"",program:row.program||row.cohort?matches[0].program??"":""};
}
