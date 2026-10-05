import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccountContext } from "@/lib/auth";
import { professionalSettings } from "@/lib/professional-profile/repository";
import { ProfessionalProfileEditor } from "@/components/professional/profile-editor";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import type { Settings } from "@/lib/professional-profile/types";
export const dynamic = "force-dynamic";
export const metadata = { title: "My professional profile | TXKPRO", robots: { index: false, follow: false } };
export default async function Page() {
  const account = await getAccountContext(); if (!account) redirect("/login");
  const results = await Promise.allSettled([professionalSettings("educator"), professionalSettings("staff")]); const profiles: Settings[] = [];
  for (const result of results) { if (result.status === "fulfilled") profiles.push({ ...result.value, displayName: result.value.displayName || `${account.firstName} ${account.lastName}`.trim() }); else if (!(result.reason instanceof Response) || result.reason.status !== 403) throw result.reason; }
  return <><header className="topbar"><Brand /><div className="header-actions"><Link className="button button-ghost" href={account.role === "educator" ? "/institution" : account.role === "admin" ? "/admin" : "/dashboard"}>Workspace</Link><ThemeToggle /><SignOutButton /></div></header><main className="page-wrap professional-workspace">{profiles.length ? <ProfessionalProfileEditor initial={profiles} /> : <section className="card"><h1>Professional profile unavailable</h1><p>An active institution or TXKPRO staff membership is required.</p></section>}</main></>;
}
