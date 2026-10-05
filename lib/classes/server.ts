import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
export async function classRpc<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const supabase = await createServerSupabaseClient();
  const { data,error } = await supabase.rpc(name,args);
  if (error) throw Response.json({error:error.message}, {status: /denied|authentication|recipient|scope/i.test(error.message) ? 403 : 400});
  return data as T;
}
export type CohortOption = {cohortId:string;institutionId:string;name:string;program:string|null;startDate?:string|null;term?:string|null;canManage?:boolean};
export type ClassRecord = {classId:string;institutionId:string;name:string;courseName:string|null;status:string;canManage:boolean;cohorts:CohortOption[];instructors:{userId:string;name:string}[]|null;enrollments:{userId:string;studentId:string|null;name:string;cohortId:string|null;status:string}[];invitations:{invitationId:string;email:string;status:string;deliveryStatus:string}[];links:{linkId:string;status:string;expiresAt:string}[]};
export type ClassWorkspace = {offset:number;hasMore:boolean;classes:ClassRecord[];cohorts:CohortOption[]};
