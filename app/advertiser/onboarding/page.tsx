import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { getAccountContext } from "@/lib/auth";
import { AdvertiserOnboardingForm } from "@/components/advertiser/advertiser-onboarding-form";

export const dynamic = "force-dynamic";

export default async function AdvertiserOnboardingPage() {
  await connection();
  const account = await getAccountContext();
  if (!account) redirect("/login?next=/advertiser/onboarding");
  if (account.advertiser) redirect("/advertiser");
  return <><header className="topbar"><Brand/><ThemeToggle/></header><main className="page-wrap advertiser-narrow"><div className="page-heading"><div><p className="eyebrow">Ads Manager setup</p><h1>Tell us about your business</h1><p className="card-sub">Your advertiser workspace opens immediately after setup.</p></div></div><AdvertiserOnboardingForm email={account.email??""}/></main></>;
}
