import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type StudentDraft = { id:string;contentType:"post"|"article"|"event"|"poll";payload:Record<string,unknown>;version:number;updatedAt:string };
type AssetAccess={path:string;mimeType:string};

async function rpc<T>(name:string,args:Record<string,unknown>={}) {
  const client=await createServerSupabaseClient();
  const {data,error}=await client.rpc(name,args);
  if(error) throw new Response(error.message.includes("STUDENT_ACCESS_REQUIRED")?"This composer is available to active Student accounts only.":error.message.includes("DRAFT_NOT_FOUND")?"That draft is no longer available.":error.message.includes("MEDIA")?"The image could not be processed.":"The draft action could not be completed.",{status:error.message.includes("ACCESS")?403:400});
  return data as T;
}

export const listStudentDrafts=()=>rpc<StudentDraft[]>("community_student_drafts");
export const saveStudentDraft=(contentType:string,payload:Record<string,unknown>,draftId?:string|null)=>rpc<StudentDraft>("community_student_draft_save",{p_content_type:contentType,p_payload:payload,p_draft_id:draftId||null});
export const deleteStudentDraft=(draftId:string)=>rpc<boolean>("community_student_draft_delete",{p_draft_id:draftId});
export const registerStudentMedia=(input:{assetId:string;draftId:string;storagePath:string;publicUrl:string;mimeType:string;byteSize:number;altText:string})=>rpc<{id:string;url:string;altText:string}>("community_student_media_register",{p_asset_id:input.assetId,p_draft_id:input.draftId,p_storage_path:input.storagePath,p_public_url:input.publicUrl,p_mime_type:input.mimeType,p_byte_size:input.byteSize,p_alt_text:input.altText});
export const deleteStudentMedia=(assetId:string)=>rpc<string>("community_student_media_delete",{p_asset_id:assetId});
export const studentMediaAccess=(assetId:string)=>rpc<AssetAccess>("community_student_media_access",{p_asset_id:assetId});
export const publishStudentPost=(input:Record<string,unknown>,draftId:string,assetIds:string[])=>rpc<{id:string}>("community_student_post_publish",{p_input:input,p_draft_id:draftId,p_asset_ids:assetIds});
export const publishStudentEvent=(input:Record<string,unknown>,draftId:string,assetIds:string[])=>rpc<{id:string}>("community_student_event_publish",{p_input:input,p_draft_id:draftId,p_asset_ids:assetIds});
export const publishStudentPoll=(input:Record<string,unknown>,draftId:string)=>rpc<{id:string}>("community_student_poll_publish",{p_input:input,p_draft_id:draftId});
