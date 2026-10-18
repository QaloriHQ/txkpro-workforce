import { requireRole } from "@/lib/auth";
import { isPlatformSuperAdmin } from "@/lib/institutions";
import { AdminWorkspaceShell } from "@/components/admin/admin-workspace-shell";
import "./admin-workspace.css";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const account = await requireRole(["admin"]);
  return <AdminWorkspaceShell isSuperAdmin={isPlatformSuperAdmin(account)}>{children}</AdminWorkspaceShell>;
}
