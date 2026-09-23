import "server-only";

import { getAccountContext } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { StudentContext } from "@/lib/student/types";

export async function getStudentContext(): Promise<StudentContext | null> {
  const account = await getAccountContext();
  if (!account || account.role !== "student") return null;

  const supabase = await createServerSupabaseClient();
  const { data: profile, error } = await supabase
    .from("wf_student_profiles")
    .select("student_id")
    .eq("user_id", account.legacyUserId)
    .maybeSingle();

  if (error || !profile?.student_id) return null;

  return {
    authUserId: account.authUserId,
    legacyUserId: account.legacyUserId,
    studentId: profile.student_id,
    email: account.email,
    firstName: account.firstName,
    lastName: account.lastName,
  };
}

export async function requireStudentContext() {
  const context = await getStudentContext();
  if (!context) {
    throw new Response("Student membership required", { status: 403 });
  }
  return context;
}
