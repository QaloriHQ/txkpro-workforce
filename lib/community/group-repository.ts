import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { CommunityGroup,CommunityGroupDetail } from "@/lib/community/group-types";
async function rpc<T>(name:string,args:Record<string,unknown>={}){const c=await createServerSupabaseClient();const {data,error}=await c.rpc(name,args);if(error){const m=error.message||"";throw new Response(m.includes("ACCESS_DENIED")?"You do not have permission for that group action.":m.includes("NOT_FOUND")?"The group is unavailable.":"The group action could not be completed.",{status:m.includes("ACCESS_DENIED")?403:m.includes("NOT_FOUND")?404:400});}return data as T;}
export const listGroups=(scope:"discover"|"mine")=>rpc<CommunityGroup[]>("community_groups",{p_scope:scope});
export const createGroup=(v:{name:string;description:string;visibility:string;joinPolicy:string})=>rpc<{id:string;slug:string}>("community_group_create",{p_name:v.name,p_description:v.description,p_visibility:v.visibility,p_join_policy:v.joinPolicy});
export const getGroup=(slug:string)=>rpc<CommunityGroupDetail>("community_group",{p_slug:slug});
export const joinGroup=(id:string)=>rpc<{status:string}>("community_group_join",{p_group_id:id});
export const leaveGroup=(id:string)=>rpc<{status:string}>("community_group_leave",{p_group_id:id});
export const inviteGroupMember=(id:string,userId:string)=>rpc<{status:string}>("community_group_invite",{p_group_id:id,p_user_id:userId});
export const createGroupPost=(id:string,body:string)=>rpc<{id:string}>("community_group_post_create",{p_group_id:id,p_body:body});
export const setGroupMember=(id:string,userId:string,action:string)=>rpc<{updated:boolean}>("community_group_member_set",{p_group_id:id,p_user_id:userId,p_action:action});
export const decideGroupRequest=(requestId:string,decision:string)=>rpc<{status:string}>("community_group_request_decide",{p_request_id:requestId,p_decision:decision});
export const moderateGroupPost=(id:string,postId:string,action:string)=>rpc<{status:string}>("community_group_post_moderate",{p_group_id:id,p_post_id:postId,p_action:action});
