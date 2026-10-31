import type { ReactNode } from "react";
import { Brand } from "@/components/brand";
import { EmployerWorkspaceNav } from "@/components/employer/workspace-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";

export function JobsShell({ children }: { children: ReactNode }) {
  return <><header className="topbar"><Brand /><EmployerWorkspaceNav active="jobs" /><ThemeToggle /><SignOutButton /></header><main className="page-wrap">{children}</main></>;
}
