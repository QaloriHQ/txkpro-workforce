import { redirect } from "next/navigation";
import { getAccountContext } from "@/lib/auth";
import { communityNavigation } from "@/lib/community/navigation";
import { CommunityHeader } from "@/components/community/community-header";
import { EventDetail } from "@/components/community/event-workspace";
import { getEvent } from "@/lib/community/event-repository";
import { communityComments } from "@/lib/community/repository";
export const dynamic = "force-dynamic";
export default async function ManageEvent({ params }: { params: Promise<{ postId: string }> }) {
  const account = await getAccountContext(); if (!account) redirect("/login");
  const name = [account.firstName, account.lastName].filter(Boolean).join(" ") || "TXKPRO member";
  const id = (await params).postId;
  const [event, comments] = await Promise.all([getEvent(id), communityComments(id)]);
  return <><CommunityHeader name={name} {...communityNavigation(account)} /><main className="community-page"><EventDetail initial={event} initialComments={comments} /></main></>;
}
