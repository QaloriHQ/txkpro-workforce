import { redirect } from "next/navigation";
import { getAccountContext } from "@/lib/auth";
import { communityNavigation } from "@/lib/community/navigation";
import { CommunityHeader } from "@/components/community/community-header";
import { PollCreator } from "@/components/community/poll-workspace";
import { RoleAwareCommunityHeader } from "@/components/community/role-aware-community-header";
import { StudentCommunityComposer } from "@/components/community/student-community-composer";
import { StudentPollGallery } from "@/components/community/student-discovery-gallery";
import { listStudentPollGallery } from "@/lib/community/student-gallery-repository";
export const dynamic = "force-dynamic";
export default async function Polls() {
  const account = await getAccountContext(); if (!account) redirect("/login");
  const name = [account.firstName, account.lastName].filter(Boolean).join(" ") || "TXKPRO member";
  if (account.role === "student") {
    const polls = await listStudentPollGallery();
    return <><RoleAwareCommunityHeader account={account} /><main className="community-page student-discovery-page"><div className="student-discovery-heading"><div><p className="eyebrow">Workforce Community</p><h1>Polls</h1><p>Answer community questions and explore privacy-safe aggregate results.</p></div><StudentCommunityComposer viewerName={name} triggerText="Create poll" initialType="poll" /></div><StudentPollGallery items={polls} nowIso={new Date().toISOString()} /></main></>;
  }
  return <><CommunityHeader name={name} {...communityNavigation(account)} /><main className="community-page"><div className="community-heading"><p className="eyebrow">Workforce Community</p><h1>Polls</h1><p>Ask one question and share aggregate results without exposing individual choices.</p></div><PollCreator /></main></>;
}
