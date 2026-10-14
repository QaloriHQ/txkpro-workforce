import { redirect } from "next/navigation";
import { getAccountContext } from "@/lib/auth";
import { CommunityHeader } from "@/components/community/community-header";
import { PollDetail } from "@/components/community/poll-workspace";
import { getPoll } from "@/lib/community/poll-repository";
export const dynamic = "force-dynamic";
export default async function Poll({ params }: { params: Promise<{ postId: string }> }) { const a = await getAccountContext(); if (!a) redirect("/login"); const name = [a.firstName, a.lastName].filter(Boolean).join(" ") || "TXKPRO member"; return <><CommunityHeader name={name} workspaceHref="/dashboard" /><main className="community-page"><PollDetail initial={await getPoll((await params).postId)} /></main></>; }
