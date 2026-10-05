"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BellIcon, LifebuoyIcon } from "@heroicons/react/24/outline";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { ActionModal } from "@/components/design-system/action-modal";

export function StudentWorkspaceHeader({ firstName, lastName }: { firstName: string; lastName: string }) {
  const [online, setOnline] = useState<boolean | null>(null);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  const initials = [firstName, lastName].map(n => n?.trim().slice(0, 1)).join("") || "ME";
  return <header className="student-prototype-header">
    <div className="student-prototype-brand"><Brand /></div>
    <div className="student-prototype-toolbar">
      <div className="student-prototype-tools">
        <ActionModal title="Your workspace guide" triggerLabel="Guide" triggerContent={<><LifebuoyIcon aria-hidden="true" /><span>Guide</span></>}>
          <p>Build your skills, showcase your work, and take your next step toward a local career.</p>
          <div className="student-menu-links"><Link href="/student/employer-training">Training Center</Link><Link href="/student/opportunities">Career & interviews</Link><Link href="/student/portfolio">Customize portfolio</Link><Link href="/student/profile">Profile & visibility settings</Link></div>
          <p className="muted">Feed, Messages, daily trivia and PRO Points are coming soon.</p>
        </ActionModal>
        <span className="student-connection"><i className={online ? "connected" : ""} />{online === null ? "Connecting" : online ? "Online" : "Offline"}</span>
      </div>
      <div className="student-prototype-tools student-header-actions">
        <ThemeToggle />
        <ActionModal title="Notifications" triggerLabel="Notifications" triggerContent={<BellIcon aria-hidden="true" />}><p>Coming soon</p><p className="muted">Review your current interview requests in Career and assigned courses in Training.</p><Link className="button" href="/student/opportunities">View career activity</Link></ActionModal>
        <ActionModal title="My account" triggerLabel="Open profile and account menu" triggerContent={<span className="student-avatar">{initials}</span>}><div className="student-menu-links"><Link href="/student/profile">My profile & visibility</Link><Link href="/student/portfolio">My resume & portfolio</Link></div><SignOutButton /></ActionModal>
      </div>
    </div>
  </header>;
}
