import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { hasSupabaseServerConfig } from "@/lib/supabase/server";

export default async function DashboardPage() {
  if (!hasSupabaseServerConfig()) redirect("/demo/student");
  const auth = await getAuthContext();
  if (!auth) redirect("/login");

  const destination = {
    student: "/demo/student",
    educator: "/demo/educator",
    employer: "/demo/employer",
    admin: "/demo/admin",
  }[auth.role];

  redirect(destination);
}
