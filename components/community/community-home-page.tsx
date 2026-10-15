import { redirect } from "next/navigation";
import { getAccountContext, hasEmployeeMembership, hasStaffProfileMembership } from "@/lib/auth";
import { communityNavigation } from "@/lib/community/navigation";
import { CommunityHeader } from "@/components/community/community-header";
import { CommunityFeed } from "@/components/community/community-feed";
import { StudentWorkspaceHeader } from "@/components/student/workspace-header";
import { StudentWorkspaceNav } from "@/components/student/workspace-nav";

export async function CommunityHomePage({ expectedHref }: { expectedHref: string }) {
  const account = await getAccountContext();
  if (!account) redirect("/login");
  if (account.userStatus.toLowerCase() !== "active") redirect("/dashboard");
  if (!account.role && !hasEmployeeMembership(account) && !hasStaffProfileMembership(account)) redirect("/onboarding");

  const navigation = communityNavigation(account);
  if (navigation.communityHref !== expectedHref) redirect(navigation.communityHref);
  const name = [account.firstName, account.lastName].filter(Boolean).join(" ") || "TXKPRO member";
  const studentMode = navigation.communityHref === "/student/community";

  return <>
    {studentMode ? <StudentWorkspaceHeader firstName={account.firstName} lastName={account.lastName} mode="community" /> : <CommunityHeader name={name} {...navigation} />}
    {studentMode ? <StudentWorkspaceNav active="home" /> : null}
    <main className="community-page">
      <div className="community-heading">
        <p className="eyebrow">TXKPRO Workforce Community</p>
        <h1>Home</h1>
        <p>Learn from people building careers, teams, and training programs.</p>
      </div>
      <CommunityFeed />
    </main>
  </>;
}
