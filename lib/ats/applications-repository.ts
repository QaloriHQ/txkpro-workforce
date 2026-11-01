import "server-only";

import { getVerifiedIdentity, type VerifiedIdentity } from "@/lib/auth";
import type { EmployerContext } from "@/lib/employer/types";
import type { PipelineField, PipelineGraph } from "@/lib/employer/ats-pipelines";
import { getPublicAppOrigin } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ApplicantFormDefinition, ApplicationTask, AtsApplication, CandidateInvitation } from "@/lib/ats/applications";

type Row = Record<string, unknown>;
const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
function mapInvitation(row: Row): CandidateInvitation {
  return { id:String(row.id), invitationId:String(row.invitation_id), jobId:String(row.job_id), email:String(row.email),
    studentId:row.student_id?String(row.student_id):null, status:row.status as CandidateInvitation["status"],
    deliveryStatus:row.delivery_status as CandidateInvitation["deliveryStatus"], sendCount:Number(row.send_count),
    expiresAt:String(row.expires_at), lastSentAt:row.last_sent_at?String(row.last_sent_at):null, createdAt:String(row.created_at) };
}
function mapTask(row: Row): ApplicationTask {
  return { id:String(row.id),nodeId:String(row.node_id),stageId:row.stage_id?String(row.stage_id):null,kind:String(row.node_kind),
    label:String(row.label),instructions:String(row.instructions??""),ownerRole:String(row.owner_role),candidateVisible:Boolean(row.candidate_visible),
    required:Boolean(row.required),status:row.status as ApplicationTask["status"],targetHours:row.target_hours==null?null:Number(row.target_hours),
    assignedAt:row.assigned_at?String(row.assigned_at):null,dueAt:row.due_at?String(row.due_at):null,revision:Number(row.revision),
    submittedAt:row.submitted_at?String(row.submitted_at):null,completedAt:row.completed_at?String(row.completed_at):null };
}
function mapApplication(row:Row, job:Row|undefined, tasks:ApplicationTask[]):AtsApplication {
  return {id:String(row.id),applicationId:String(row.application_id),jobId:String(row.job_id),jobListingId:String(job?.job_listing_id??""),
    jobTitle:String(job?.title??"Job listing"),employerId:String(row.employer_id),employerName:String(job?.employer_name??"Employer"),
    pipelineVersionId:String(row.pipeline_version_id),identityType:row.identity_type as AtsApplication["identityType"],
    studentId:row.student_id?String(row.student_id):null,externalEmail:row.external_email?String(row.external_email):null,
    status:row.status as AtsApplication["status"],lifecycleReason:row.lifecycle_reason?String(row.lifecycle_reason):null,revision:Number(row.revision),
    submittedAt:row.submitted_at?String(row.submitted_at):null,withdrawnAt:row.withdrawn_at?String(row.withdrawn_at):null,
    closedAt:row.closed_at?String(row.closed_at):null,tasks};
}

export async function createCandidateInvitation(context:EmployerContext,input:{jobId:string;email:string;studentId?:string|null}) {
  const email=clean(input.email,320).toLowerCase();
  if(!email || !email.includes("@")) throw new Response("Enter a valid candidate email.",{status:400});
  const client=await createServerSupabaseClient();
  const {data,error}=await client.rpc("wf_ats_candidate_invitation_create",{
    p_employer_id:context.employerId,p_job_id:input.jobId,p_email:email,p_student_id:clean(input.studentId,160)||null,
  });
  if(error){if(error.code==="42501")throw new Response("Candidate invitation denied.",{status:403});if(error.code==="P0002")throw new Response("Publish the job before inviting candidates.",{status:409});throw error;}
  const invitation=mapInvitation(data as Row);
  const admin=createAdminClient();
  const {data:job,error:jobError}=await admin.from("wf_ats_job_listings").select("job_listing_id").eq("id",input.jobId).eq("employer_id",context.employerId).single();
  if(jobError)throw jobError;
  const next=`/jobs/${encodeURIComponent(job.job_listing_id)}/apply?invite=${encodeURIComponent(invitation.id)}`;
  const {error:deliveryError}=await admin.auth.signInWithOtp({email,options:{shouldCreateUser:true,emailRedirectTo:`${getPublicAppOrigin()}/auth/confirm?next=${encodeURIComponent(next)}`}});
  await admin.from("wf_ats_candidate_invitations").update({delivery_status:deliveryError?"failed":"sent",delivery_error_code:deliveryError?.code??null,
    send_count:invitation.sendCount+1,last_sent_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",invitation.id);
  return {...invitation,deliveryStatus:deliveryError?"failed" as const:"sent" as const,sendCount:invitation.sendCount+1,lastSentAt:new Date().toISOString()};
}

export async function revokeCandidateInvitation(context:EmployerContext,id:string,reason:string){
  const client=await createServerSupabaseClient();
  const {data,error}=await client.rpc("wf_ats_candidate_invitation_revoke",{p_employer_id:context.employerId,p_invitation_id:id,p_reason:clean(reason,500)});
  if(error){if(error.code==="42501")throw new Response("Invitation action denied.",{status:403});if(error.code==="P0002")throw new Response("Invitation not found.",{status:404});throw error;}
  return mapInvitation(data as Row);
}

export async function listJobInvitations(context:EmployerContext,jobId:string){
  const client=await createServerSupabaseClient();
  if(context.role!=="hiring_manager")await client.rpc("wf_ats_candidate_invitations_expire",{p_employer_id:context.employerId});
  const {data,error}=await client.from("wf_ats_candidate_invitations").select("*").eq("employer_id",context.employerId).eq("job_id",jobId).order("created_at",{ascending:false});
  if(error)throw error; return (data??[]).map((row)=>mapInvitation(row));
}

export async function applicantForm(jobListingId:string,invitationId:string|null,verifiedIdentity?:VerifiedIdentity):Promise<ApplicantFormDefinition>{
  const identity=verifiedIdentity??await getVerifiedIdentity();
  if(!identity)throw new Response("Verified email session required.",{status:401});
  const admin=createAdminClient();
  const {data:job,error}=await admin.from("wf_ats_job_listings").select("id,job_listing_id,title,summary,employer_id,pipeline_version_id,status").eq("job_listing_id",jobListingId).eq("status","published").single();
  if(error||!job)throw new Response("Published job not found.",{status:404});
  if(invitationId){const {data:invite}=await admin.from("wf_ats_candidate_invitations").select("id,email,status,expires_at,job_id").eq("id",invitationId).maybeSingle();
    if(!invite||invite.job_id!==job.id||invite.status!=="pending"||new Date(invite.expires_at)<=new Date()||invite.email.toLowerCase()!==identity.email?.toLowerCase())throw new Response("This invitation is unavailable for the verified recipient.",{status:403});}
  const [{data:version,error:versionError},{data:contractor}]=await Promise.all([
    admin.from("wf_ats_pipeline_versions").select("graph_json").eq("id",job.pipeline_version_id).eq("employer_id",job.employer_id).single(),
    admin.from("contractors").select("business_name").eq("contractor_id",job.employer_id).single(),
  ]);
  if(versionError)throw versionError;
  const graph=version.graph_json as PipelineGraph;
  const fields:PipelineField[]=graph.nodes.filter((node)=>node.kind==="application_form"&&node.candidateVisible).flatMap((node)=>node.config.fields??[]);
  return {jobListingId:job.job_listing_id,title:job.title,summary:job.summary,employerName:contractor?.business_name??"Employer",fields,invitationId};
}

export async function submitApplication(input:{jobListingId:string;invitationId?:string|null;answers:Record<string,unknown>;privacyAccepted:boolean}){
  if(!input.privacyAccepted)throw new Response("Accept the applicant privacy notice to submit.",{status:400});
  const client=await createServerSupabaseClient();
  const {data,error}=await client.rpc("wf_ats_application_submit",{p_job_listing_id:input.jobListingId,p_invitation_id:input.invitationId??null,p_answers:input.answers,p_privacy_notice_version:"ats-applicant-privacy-v1"});
  if(error){if(error.code==="42501")throw new Response(error.message,{status:403});if(error.code==="P0002")throw new Response("This job is no longer accepting applications.",{status:404});if(error.code==="23505")throw new Response("You already applied to this job.",{status:409});if(error.code==="22023")throw new Response(error.message,{status:400});throw error;}
  return data as Row;
}

async function hydrateApplications(rows:Row[],candidateProjection=false):Promise<AtsApplication[]>{
  if(!rows.length)return [];
  const admin=createAdminClient(); const taskClient=candidateProjection?await createServerSupabaseClient():admin; const ids=rows.map((row)=>String(row.id)); const jobIds=[...new Set(rows.map((row)=>String(row.job_id)))];
  const [{data:jobs,error:jobsError},{data:tasks,error:tasksError}]=await Promise.all([
    admin.from("wf_ats_job_listings").select("id,job_listing_id,title,employer_id").in("id",jobIds),
    taskClient.from("wf_ats_application_tasks").select("*").in("application_id",ids).order("created_at"),
  ]); if(jobsError)throw jobsError;if(tasksError)throw tasksError;
  const employerIds=[...new Set((jobs??[]).map((row)=>row.employer_id))]; const {data:employers}=await admin.from("contractors").select("contractor_id,business_name").in("contractor_id",employerIds);
  const names=new Map((employers??[]).map((row)=>[row.contractor_id,row.business_name]));
  const jobMap=new Map((jobs??[]).map((row)=>[row.id,{...row,employer_name:names.get(row.employer_id)}]));
  return rows.map((row)=>mapApplication(row,jobMap.get(String(row.job_id)),(tasks??[]).filter((task)=>task.application_id===row.id).map(mapTask)));
}

export async function listCandidateApplications(){
  const identity=await getVerifiedIdentity();if(!identity)return [];
  const client=await createServerSupabaseClient();const {data,error}=await client.from("wf_ats_applications").select("*").eq("applicant_auth_user_id",identity.authUserId).order("submitted_at",{ascending:false}).limit(200);
  if(error)throw error;return hydrateApplications((data??[]) as Row[],true);
}
export async function listEmployerApplications(context:EmployerContext,jobId?:string|null){
  const client=await createServerSupabaseClient();let query=client.from("wf_ats_applications").select("*").eq("employer_id",context.employerId).order("submitted_at",{ascending:false}).limit(200);if(jobId)query=query.eq("job_id",jobId);
  const {data,error}=await query;if(error)throw error;return hydrateApplications((data??[]) as Row[]);
}
export async function withdrawApplication(id:string,revision:number,reason:string){const client=await createServerSupabaseClient();const{data,error}=await client.rpc("wf_ats_application_withdraw",{p_application_id:id,p_revision:revision,p_reason:clean(reason,500)});if(error){if(error.code==="42501")throw new Response("Application not found.",{status:404});if(error.code==="40001")throw new Response("Application changed. Reload and try again.",{status:409});throw error;}return data;}
export async function closeEmployerApplication(context:EmployerContext,id:string,revision:number,reason:string){const client=await createServerSupabaseClient();const{data,error}=await client.rpc("wf_ats_application_employer_close",{p_employer_id:context.employerId,p_application_id:id,p_revision:revision,p_reason:clean(reason,500)});if(error){if(error.code==="42501")throw new Response("Application action denied.",{status:403});if(error.code==="40001")throw new Response("Application changed. Reload and try again.",{status:409});throw error;}return data;}
export async function submitCandidateTask(id:string,revision:number,evidence:Record<string,unknown>){const client=await createServerSupabaseClient();const{data,error}=await client.rpc("wf_ats_candidate_task_submit",{p_task_id:id,p_revision:revision,p_evidence:evidence});if(error){if(error.code==="42501")throw new Response("Task unavailable.",{status:403});if(error.code==="40001")throw new Response("Task changed. Reload and try again.",{status:409});throw error;}return data;}
export async function transitionEmployerTask(context:EmployerContext,id:string,revision:number,status:string,reason:string){const client=await createServerSupabaseClient();const{data,error}=await client.rpc("wf_ats_employer_task_transition",{p_employer_id:context.employerId,p_task_id:id,p_revision:revision,p_status:status,p_reason:clean(reason,500)});if(error){if(error.code==="42501")throw new Response("Task action denied.",{status:403});if(error.code==="40001")throw new Response("Task changed. Reload and try again.",{status:409});throw error;}return data;}
