import { redirect } from "next/navigation";
import { getAccountContext } from "@/lib/auth";
import { hasSupabaseServerConfig } from "@/lib/supabase/server";

export default async function DashboardPage() {
  if (!hasSupabaseServerConfig()) redirect("/login");

  const account = await getAccountContext();
  if (!account) redirect("/login");
  if (!account.role) redirect("/onboarding");

  if (
    !account.onboarding ||
    account.onboarding.status === "not_started" ||
    account.onboarding.status === "in_progress"
  ) {
    redirect("/onboarding");
  }

  if (account.onboarding.status === "pending_review") {
    redirect("/onboarding?pending=1");
  }

  if (account.role === "admin") redirect("/admin");
  if (account.role === "employer") redirect("/employer");
  if (account.role === "student") redirect("/student");
  if (account.role === "educator") redirect("/institution");

  redirect("/onboarding");
}
