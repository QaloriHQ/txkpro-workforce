import { redirect } from "next/navigation";
import { getAccountContext, hasEmployeeMembership, hasStaffProfileMembership } from "@/lib/auth";
import { CommunityHeader } from "@/components/community/community-header";
import { CommunityFeed } from "@/components/community/community-feed";
export const dynamic = "force-dynamic";

export default async function CommunityPage() {
  const account = await getAccountContext();
  if (!account) redirect("/login");
  if (account.userStatus.toLowerCase() !== "active") redirect("/dashboard");
  if (!account.role && !hasEmployeeMembership(account) && !hasStaffProfileMembership(account)) redirect("/onboarding");
  const workspaceHref = account.role === "admin" ? "/admin" : account.role === "employer" ? "/employer" : account.role === "educator" ? "/institution" : hasEmployeeMembership(account) ? "/employee" : hasStaffProfileMembership(account) ? "/professional/profile" : "/student";
  const name = [account.firstName, account.lastName].filter(Boolean).join(" ") || "TXKPRO member";
  return <><CommunityHeader name={name} workspaceHref={workspaceHref} /><main className="community-page"><div className="community-heading"><p className="eyebrow">TXKPRO Workforce Community</p><h1>Home</h1><p>Learn from people building careers, teams, and training programs.</p></div><CommunityFeed viewerName={name} /></main></>;
}
