import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { AdvertiserDashboard } from "@/components/advertiser/advertiser-dashboard-v2";
import { getAccountContext } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AdvertiserAnalytics,AdvertiserDashboard as DashboardData } from "@/lib/advertiser/types";

export const dynamic="force-dynamic";
export default async function AdvertiserPage(){await connection();const account=await getAccountContext();if(!account)redirect("/login?next=/advertiser");if(!account.advertiser)redirect("/advertiser/onboarding");const supabase=await createServerSupabaseClient();const advertiserId=account.advertiser.advertiserId;const[dashboard,analytics,enterprise,manager]=await Promise.all([supabase.rpc("advertiser_dashboard",{p_advertiser_id:advertiserId}),supabase.rpc("advertiser_analytics",{p_advertiser_id:advertiserId,p_campaign_id:null,p_from:null,p_to:null,p_export:false}),supabase.rpc("advertiser_enterprise_context",{p_advertiser_id:advertiserId}),supabase.rpc("advertiser_manager_context",{p_advertiser_id:advertiserId})]);if(dashboard.error||!dashboard.data)throw new Error(dashboard.error?.message??"Advertiser dashboard unavailable");if(analytics.error||!analytics.data)throw new Error(analytics.error?.message??"Advertiser analytics unavailable");if(enterprise.error||!enterprise.data)throw new Error(enterprise.error?.message??"Enterprise controls unavailable");if(manager.error||!manager.data)throw new Error(manager.error?.message??"Ads Manager library unavailable");return <><header className="topbar"><Brand/><div className="header-actions"><span className="pill">Advertiser</span><ThemeToggle/><SignOutButton/></div></header><AdvertiserDashboard initial={{...dashboard.data,enterprise:enterprise.data,manager:manager.data} as DashboardData} initialAnalytics={analytics.data as AdvertiserAnalytics}/></>}
