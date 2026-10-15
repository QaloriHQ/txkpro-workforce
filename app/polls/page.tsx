import { redirect } from "next/navigation";
import { getAccountContext } from "@/lib/auth";
import { communityNavigation } from "@/lib/community/navigation";
import { CommunityHeader } from "@/components/community/community-header";
import { PollCreator } from "@/components/community/poll-workspace";
export const dynamic = "force-dynamic";
export default async function Polls() {
  const account = await getAccountContext(); if (!account) redirect("/login");
  const name = [account.firstName, account.lastName].filter(Boolean).join(" ") || "TXKPRO member";
  return <><CommunityHeader name={name} {...communityNavigation(account)} /><main className="community-page"><div className="community-heading"><p className="eyebrow">Workforce Community</p><h1>Polls</h1><p>Ask one question and share aggregate results without exposing individual choices.</p></div><PollCreator /></main></>;
}
