"use client";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { BellIcon } from "@heroicons/react/24/outline";

export function CommunityHeader({ name, workspaceHref }: { name: string; workspaceHref: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("") || "ME";
  return <header className="community-header">
    <Brand />
    <nav aria-label="Community tools">
      <Link href={workspaceHref} className="community-workspace-link">My workspace</Link>
      <ThemeToggle />
      <button className="community-icon-button" type="button" aria-label="Notifications"><BellIcon aria-hidden="true" /></button>
      <span className="student-avatar" aria-label={name}>{initials}</span>
    </nav>
  </header>;
}
