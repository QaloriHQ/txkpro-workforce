"use client";
import Link from "next/link";
import { BellIcon } from "@heroicons/react/24/outline";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { ActionModal } from "@/components/design-system/action-modal";

export function StudentWorkspaceHeader({ firstName, lastName }: { firstName: string; lastName: string }) {
  const initials = [firstName, lastName].map(n => n?.trim().slice(0, 1)).join("") || "ME";
  return <header className="student-prototype-header">
    <div className="student-prototype-brand"><Brand /></div>
      <div className="student-prototype-tools student-header-actions">
        <ThemeToggle />
        <ActionModal title="Notifications" triggerLabel="Notifications" triggerContent={<BellIcon aria-hidden="true" />}><p>Coming soon</p><p className="muted">Review your current interview requests in Career and assigned courses in Training.</p><Link className="button" href="/student/opportunities?view=interviews">View career activity</Link></ActionModal>
        <ActionModal title="My account" triggerLabel="Open profile and account menu" triggerContent={<span className="student-avatar">{initials}</span>}><div className="student-menu-links"><Link href="/student/profile">My profile & visibility</Link><Link href="/student/portfolio">My resume & portfolio</Link></div><SignOutButton /></ActionModal>
      </div>
  </header>;
}
