"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowRightStartOnRectangleIcon,
  Bars3Icon, BellAlertIcon, BuildingOffice2Icon, ChartBarSquareIcon,
  ChevronDoubleLeftIcon, ChevronDoubleRightIcon, ClipboardDocumentCheckIcon,
  Cog6ToothIcon, DocumentChartBarIcon, HomeIcon, MegaphoneIcon,
  ServerStackIcon, ShieldCheckIcon, Squares2X2Icon, UserGroupIcon,
  UsersIcon, XMarkIcon,
} from "@heroicons/react/24/outline";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";

const groups = [
  { label: "Workspace", items: [
    { label: "Overview", href: "/admin", icon: Squares2X2Icon },
    { label: "Approvals", href: "/admin", icon: ClipboardDocumentCheckIcon, key: "approvals" },
  ] },
  { label: "People & Access", items: [
    { label: "All users", href: "/admin/users", icon: UsersIcon, superOnly: true },
    { label: "Institutions", href: "/admin/institutions", icon: BuildingOffice2Icon, superOnly: true },
    { label: "Platform invitations", href: "/admin/invitations", icon: UserGroupIcon },
  ] },
  { label: "Operations", items: [
    { label: "Retention cases", href: "/admin/retention", icon: HomeIcon },
    { label: "Concierge queue", href: "/admin/concierge", icon: BellAlertIcon },
    { label: "Moderation", href: "/admin/moderation", icon: ShieldCheckIcon },
  ] },
  { label: "Advertising", items: [
    { label: "Advertiser approvals", href: "/admin/advertisers", icon: MegaphoneIcon },
    { label: "Placement preview", href: "/admin/ads/preview", icon: DocumentChartBarIcon },
  ] },
  { label: "Governance", items: [
    { label: "Audit & events", href: "/admin/audit", icon: ChartBarSquareIcon },
    { label: "MGID integration", href: "/admin/integrations/mgid", icon: ServerStackIcon, superOnly: true, stagingOnly: true },
  ] },
] as const;

type AdminWorkspaceShellProps = { children: ReactNode; isSuperAdmin: boolean; stagingMgid?: boolean };

export function AdminWorkspaceShell({ children, isSuperAdmin, stagingMgid = false }: AdminWorkspaceShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => { setDrawerOpen(false); }, [pathname]);
  useEffect(() => {
    if (!drawerOpen) return;
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setDrawerOpen(false);
    }
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [drawerOpen]);

  return (
    <div className={`txk-admin-workspace ${collapsed ? "is-collapsed" : ""} ${drawerOpen ? "is-drawer-open" : ""}`}>
      {drawerOpen ? <button type="button" className="txk-admin-backdrop" aria-label="Close administration menu" onClick={() => setDrawerOpen(false)} /> : null}
      <aside id="txk-admin-sidebar" className="txk-admin-sidebar" aria-label="Platform administration navigation">
        <div className="txk-admin-sidehead">
          <span className="txk-admin-side-brand">TXK<span>PRO</span></span>
          <button className="txk-admin-mobile-close" aria-label="Close navigation drawer" type="button" onClick={() => setDrawerOpen(false)}>
            <XMarkIcon aria-hidden="true" />
          </button>
        </div>
        <nav aria-label="Platform sections" className="txk-admin-nav">
          {groups.map(group => {
            const visible = group.items.filter(item =>
              (!("superOnly" in item && item.superOnly) || isSuperAdmin) &&
              (!("stagingOnly" in item && item.stagingOnly) || stagingMgid)
            );
            if (!visible.length) return null;
            return <div className="txk-admin-group" key={group.label}>
              <p className="txk-admin-group-label">{group.label}</p>
              {visible.map(item => {
                const active = item.href === "/admin"
                  ? pathname === "/admin" && !("key" in item)
                  : pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = item.icon;
                return <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setDrawerOpen(false)}
                  title={collapsed ? item.label : undefined}
                  aria-current={active ? "page" : undefined}
                  className={`txk-admin-navlink ${active ? "active" : ""}`}
                >
                  <Icon aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>;
              })}
            </div>;
          })}
        </nav>
        <div className="txk-admin-sidefoot">
          <button type="button" className="txk-admin-collapse" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? <ChevronDoubleRightIcon aria-hidden="true"/> : <ChevronDoubleLeftIcon aria-hidden="true"/>}
            <span>{collapsed ? "Expand" : "Collapse"}</span>
          </button>
          <Link href="/professional/profile" className="txk-admin-navlink" title={collapsed ? "My profile" : undefined}>
            <Cog6ToothIcon aria-hidden="true" /><span>My profile</span>
          </Link>
        </div>
      </aside>
      <div className="txk-admin-column">
        <header className="txk-admin-header">
          <button type="button" className="txk-admin-mobile-trigger" aria-label="Open administration menu"
            aria-controls="txk-admin-sidebar" aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)}>
            <Bars3Icon aria-hidden="true"/>
          </button>
          <div className="txk-admin-header-brand"><Brand /></div>
          <span className="txk-admin-context">{isSuperAdmin ? "Super Admin" : "Platform Admin"} workspace</span>
          <div className="txk-admin-header-actions"><ThemeToggle /><SignOutButton /></div>
        </header>
        <div className="txk-admin-content" id="txk-admin-main">{children}</div>
      </div>
    </div>
  );
}
