import { redirect } from "next/navigation";
import { getAccountContext } from "@/lib/auth";
import { communityNavigation } from "@/lib/community/navigation";
import { CommunityHeader } from "@/components/community/community-header";
import { PollDetail } from "@/components/community/poll-workspace";
import { getPoll } from "@/lib/community/poll-repository";
export const dynamic = "force-dynamic";
export default async function Poll({ params }: { params: Promise<{ postId: string }> }) {
  const account = await getAccountContext(); if (!account) redirect("/login");
  const name = [account.firstName, account.lastName].filter(Boolean).join(" ") || "TXKPRO member";
  return <><CommunityHeader name={name} {...communityNavigation(account)} /><main className="community-page"><PollDetail initial={await getPoll((await params).postId)} /></main></>;
}
