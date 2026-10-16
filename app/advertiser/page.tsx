import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { AdvertiserDashboard } from "@/components/advertiser/advertiser-dashboard";
import { getAccountContext } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AdvertiserDashboard as DashboardData } from "@/lib/advertiser/types";

export const dynamic="force-dynamic";
export default async function AdvertiserPage(){await connection();const account=await getAccountContext();if(!account)redirect("/login?next=/advertiser");if(!account.advertiser)redirect("/advertiser/onboarding");const supabase=await createServerSupabaseClient();const{data,error}=await supabase.rpc("advertiser_dashboard",{p_advertiser_id:account.advertiser.advertiserId});if(error||!data)throw new Error(error?.message??"Advertiser dashboard unavailable");return <><header className="topbar"><Brand/><div className="header-actions"><span className="pill">Advertiser</span><ThemeToggle/><SignOutButton/></div></header><AdvertiserDashboard initial={data as DashboardData}/></>}
