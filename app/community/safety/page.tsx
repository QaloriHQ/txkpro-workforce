import { CommunityHeader } from "@/components/community/community-header";
import { ModerationSelfService } from "@/components/community/moderation-self-service";
import { getAccountContext, hasEmployeeMembership, hasStaffProfileMembership } from "@/lib/auth";
import { moderationSelfCases } from "@/lib/community/moderation-repository";
import { redirect } from "next/navigation";
export const dynamic="force-dynamic";
export default async function CommunitySafetyPage(){const account=await getAccountContext();if(!account)redirect("/login");if(account.userStatus.toLowerCase()!=="active")redirect("/dashboard");
  if(!account.role&&!hasEmployeeMembership(account)&&!hasStaffProfileMembership(account))redirect("/onboarding");
  const workspaceHref=account.role==="admin"?"/admin":account.role==="employer"?"/employer":account.role==="educator"?"/institution":hasEmployeeMembership(account)?"/employee":hasStaffProfileMembership(account)?"/professional/profile":"/student";
  const name=[account.firstName,account.lastName].filter(Boolean).join(" ")||"TXKPRO member";const items=await moderationSelfCases();
  return <><CommunityHeader name={name} workspaceHref={workspaceHref}/><main className="page-wrap moderation-workspace"><div className="page-heading"><div><p className="eyebrow">Community safety</p><h1>Reports, blocks &amp; appeals</h1><p className="card-sub">Review enforcement affecting you. Reporting and blocking controls are available from each community post.</p></div></div><ModerationSelfService initial={items}/></main></>}
