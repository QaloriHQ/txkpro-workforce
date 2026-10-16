import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { AdvertiserInvitation } from "@/components/advertiser/advertiser-invitation";
import { getAccountContext } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdvertiserInvitationPage() {
  await connection();
  const account = await getAccountContext();
  if (!account) redirect("/login?next=/advertiser/invitation");
  if (account.advertiser) redirect("/advertiser");
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.rpc("advertiser_pending_invitation");
  if (!data) redirect("/dashboard");
  return <><header className="topbar"><Brand/><ThemeToggle/></header><main className="page-wrap advertiser-narrow"><div className="page-heading"><div><p className="eyebrow">Advertiser team invitation</p><h1>Join an advertiser team</h1><p className="card-sub">The invitation is matched to your verified email and grants access only to that advertiser workspace.</p></div></div><AdvertiserInvitation/></main></>;
}
