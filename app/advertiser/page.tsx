import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { AdvertiserDashboard } from "@/components/advertiser/advertiser-dashboard";
import { getAccountContext } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AdvertiserAnalytics,AdvertiserDashboard as DashboardData } from "@/lib/advertiser/types";

export const dynamic="force-dynamic";
export default async function AdvertiserPage(){await connection();const account=await getAccountContext();if(!account)redirect("/login?next=/advertiser");if(!account.advertiser)redirect("/advertiser/onboarding");const supabase=await createServerSupabaseClient();const[dashboard,analytics]=await Promise.all([supabase.rpc("advertiser_dashboard",{p_advertiser_id:account.advertiser.advertiserId}),supabase.rpc("advertiser_analytics",{p_advertiser_id:account.advertiser.advertiserId,p_campaign_id:null,p_from:null,p_to:null,p_export:false})]);if(dashboard.error||!dashboard.data)throw new Error(dashboard.error?.message??"Advertiser dashboard unavailable");if(analytics.error||!analytics.data)throw new Error(analytics.error?.message??"Advertiser analytics unavailable");return <><header className="topbar"><Brand/><div className="header-actions"><span className="pill">Advertiser</span><ThemeToggle/><SignOutButton/></div></header><AdvertiserDashboard initial={dashboard.data as DashboardData} initialAnalytics={analytics.data as AdvertiserAnalytics}/></>}
