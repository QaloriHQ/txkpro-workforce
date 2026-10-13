import { Brand } from "@/components/brand";
import { ModerationSelfService } from "@/components/community/moderation-self-service";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { getAccountContext } from "@/lib/auth";
import { moderationSelfCases } from "@/lib/community/moderation-repository";
import { redirect } from "next/navigation";
export const dynamic="force-dynamic";
export default async function RestrictedAccountPage(){const account=await getAccountContext();if(!account)redirect("/login");if(account.userStatus.toLowerCase()!=="suspended")redirect("/dashboard");
  const items=await moderationSelfCases();return <><header className="topbar"><Brand/><div className="header-actions"><span className="pill">Account suspended</span><ThemeToggle/><SignOutButton/></div></header><main className="page-wrap moderation-workspace"><div className="page-heading"><div><p className="eyebrow">Account access</p><h1>Your account is suspended</h1><p className="card-sub">Review the recorded reason and submit an appeal below. Your account remains available only for this appeal workflow.</p></div></div><ModerationSelfService initial={items}/></main></>}
