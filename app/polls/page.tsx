import { redirect } from "next/navigation";
import { getAccountContext } from "@/lib/auth";
import { CommunityHeader } from "@/components/community/community-header";
import { PollCreator } from "@/components/community/poll-workspace";
export const dynamic = "force-dynamic";
export default async function Polls() { const a = await getAccountContext(); if (!a) redirect("/login"); const name = [a.firstName, a.lastName].filter(Boolean).join(" ") || "TXKPRO member"; return <><CommunityHeader name={name} workspaceHref="/dashboard" /><main className="community-page"><div className="community-heading"><p className="eyebrow">Workforce Community</p><h1>Polls</h1><p>Ask one question and share aggregate results without exposing individual choices.</p></div><PollCreator /></main></>; }
