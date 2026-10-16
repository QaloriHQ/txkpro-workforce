import { redirect } from "next/navigation";
import { getAccountContext } from "@/lib/auth";
import { communityNavigation } from "@/lib/community/navigation";
import { CommunityHeader } from "@/components/community/community-header";
import { EventCreator } from "@/components/community/event-workspace";
import { RoleAwareCommunityHeader } from "@/components/community/role-aware-community-header";
import { StudentCommunityComposer } from "@/components/community/student-community-composer";
import { StudentEventGallery } from "@/components/community/student-discovery-gallery";
import { listStudentEventGallery } from "@/lib/community/student-gallery-repository";
export const dynamic = "force-dynamic";
export default async function Events() {
  const account = await getAccountContext(); if (!account) redirect("/login");
  const name = [account.firstName, account.lastName].filter(Boolean).join(" ") || "TXKPRO member";
  if (account.role === "student") {
    const events = await listStudentEventGallery();
    return <><RoleAwareCommunityHeader account={account} /><main className="community-page student-discovery-page"><div className="student-discovery-heading"><div><p className="eyebrow">Workforce Community</p><h1>Events</h1><p>Find upcoming events, manage your RSVPs, or bring the community together.</p></div><StudentCommunityComposer viewerName={name} triggerText="Create event" initialType="event" /></div><StudentEventGallery items={events} nowIso={new Date().toISOString()} /></main></>;
  }
  return <><CommunityHeader name={name} {...communityNavigation(account)} /><main className="community-page"><div className="community-heading"><p className="eyebrow">Workforce Community</p><h1>Events</h1><p>Publish a public or community event with privacy-safe RSVP totals.</p></div><EventCreator organizerName={name} /></main></>;
}
