import { redirect } from "next/navigation";
import { getAccountContext } from "@/lib/auth";
import { communityNavigation } from "@/lib/community/navigation";
import { CommunityHeader } from "@/components/community/community-header";
import { EventCreator } from "@/components/community/event-workspace";
export const dynamic = "force-dynamic";
export default async function Events() {
  const account = await getAccountContext(); if (!account) redirect("/login");
  const name = [account.firstName, account.lastName].filter(Boolean).join(" ") || "TXKPRO member";
  return <><CommunityHeader name={name} {...communityNavigation(account)} /><main className="community-page"><div className="community-heading"><p className="eyebrow">Workforce Community</p><h1>Events</h1><p>Publish a public or community event with privacy-safe RSVP totals.</p></div><EventCreator organizerName={name} /></main></>;
}
