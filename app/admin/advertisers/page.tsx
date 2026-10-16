import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { AdvertiserReviewQueue } from "@/components/admin/advertiser-review-queue";
import { requireRole } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
export const dynamic="force-dynamic";
export default async function AdvertiserAdminPage(){await connection();await requireRole(["admin"]);const supabase=await createServerSupabaseClient();const[queue,versions]=await Promise.all([supabase.rpc("advertiser_admin_queue"),supabase.rpc("advertiser_admin_version_queue")]);if(queue.error||versions.error)redirect("/admin");return <><header className="topbar"><Brand/><div className="header-actions"><span className="pill pill-good">Platform Admin</span><ThemeToggle/><SignOutButton/></div></header><main className="page-wrap"><div className="page-heading"><div><p className="eyebrow">Advertising operations</p><h1>Advertiser approvals</h1><p className="card-sub">Review campaigns and immutable creative revisions before anything new runs live.</p></div></div><AdvertiserReviewQueue initial={{...queue.data,creativeVersions:versions.data} as {advertisers:Array<Record<string,unknown>>;campaigns:Array<Record<string,unknown>>;creativeVersions:Array<Record<string,unknown>>}}/></main></>}
