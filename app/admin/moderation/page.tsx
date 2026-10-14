import { Brand } from "@/components/brand";
import { ModerationWorkspaceView } from "@/components/admin/moderation-workspace";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireRole } from "@/lib/auth";
import { moderationQueue } from "@/lib/community/moderation-repository";
import Link from "next/link";
export const dynamic = "force-dynamic";
export default async function AdminModerationPage() {
  await requireRole(["admin"]);
  const queue = await moderationQueue();
  return <><header className="topbar"><Brand/><div className="header-actions"><Link className="button button-ghost button-small" href="/admin">Admin home</Link><span className="pill pill-good">Platform Admin</span><ThemeToggle/><SignOutButton/></div></header><ModerationWorkspaceView initial={queue}/></>;
}
