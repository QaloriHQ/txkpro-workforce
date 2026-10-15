import{deleteStudentDraft,listStudentDrafts,saveStudentDraft}from"@/lib/community/student-composer-repository";
export const dynamic="force-dynamic";const headers={"Cache-Control":"private, no-store"};
const failure=async(e:unknown)=>Response.json({error:e instanceof Response?await e.text():"The draft action could not be completed."},{status:e instanceof Response?e.status:503,headers});
export async function GET(){try{return Response.json(await listStudentDrafts(),{headers});}catch(e){return failure(e);}}
export async function PUT(r:Request){try{const x=await r.json();if(!x||typeof x.contentType!=="string"||!x.payload||JSON.stringify(x).length>55000)return Response.json({error:"Invalid draft."},{status:400,headers});return Response.json(await saveStudentDraft(x.contentType,x.payload,x.id),{headers});}catch(e){return failure(e);}}
export async function DELETE(r:Request){try{const id=new URL(r.url).searchParams.get("id");if(!id)return Response.json({error:"Draft id is required."},{status:400,headers});return Response.json({deleted:await deleteStudentDraft(id)},{headers});}catch(e){return failure(e);}}
