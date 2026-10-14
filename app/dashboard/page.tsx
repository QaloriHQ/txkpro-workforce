import { redirect } from "next/navigation";
import { getAccountContext, hasStaffProfileMembership, hasEmployeeMembership } from "@/lib/auth";
import { hasSupabaseServerConfig } from "@/lib/supabase/server";

export default async function DashboardPage() {
  if (!hasSupabaseServerConfig()) redirect("/login");

  const account = await getAccountContext();
  if (!account) redirect("/login");
  if (account.userStatus.toLowerCase() === "suspended") redirect("/account/restricted");
  if (account.userStatus.toLowerCase() !== "active") redirect("/login?account=inactive");
  if (!account.role && hasEmployeeMembership(account)) redirect("/community");
  if (!account.role && hasStaffProfileMembership(account)) redirect("/community");
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

  if (["admin", "employer", "student", "educator"].includes(account.role)) redirect("/community");

  redirect("/onboarding");
}
