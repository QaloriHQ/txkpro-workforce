import Link from "next/link";
import {redirect} from "next/navigation";
import {getAccountContext} from "@/lib/auth";
import {cardWorkspace,configured} from "@/lib/authcard/server";
import {AuthCardWorkspace} from "@/components/authcard/workspace";
import {Brand} from "@/components/brand";
import {ThemeToggle} from "@/components/theme-toggle";
import {SignOutButton} from "@/components/sign-out-button";
import {StudentWorkspaceHeader} from "@/components/student/workspace-header";
import {StudentWorkspaceNav} from "@/components/student/workspace-nav";
export const dynamic="force-dynamic";
export default async function AuthCardPage() {
  const account=await getAccountContext();if(!account)redirect('/login');
  if(account.userStatus!=='active')redirect('/dashboard');
  const data=await cardWorkspace();
  return <>{account.role==='student'?<><StudentWorkspaceHeader firstName={account.firstName} lastName={account.lastName}/><StudentWorkspaceNav active="profile"/></>:<header className="topbar"><Brand/><Link className="button" href="/dashboard">Workspace</Link><div className="header-actions"><ThemeToggle/><SignOutButton/></div></header>}<main className="page-wrap student-training-page"><Link className="button" href={account.role==='student'?'/student/profile':'/dashboard'}>Return to workspace</Link><AuthCardWorkspace initial={data} configured={configured()}/></main></>;
}
