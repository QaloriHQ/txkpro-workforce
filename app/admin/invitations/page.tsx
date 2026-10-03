import Link from "next/link";
import { Brand } from "@/components/brand";
import { PageHeader } from "@/components/design-system";
import { InvitationManager } from "@/components/invitations/invitation-manager";
import { requireRole } from "@/lib/auth";
import { listUserInvitations } from "@/lib/invitations/service";

export const dynamic = "force-dynamic";

export default async function AdminInvitationsPage() {
  const account = await requireRole(["admin"]);
  const isSuper = account.memberships.some(m => m.role === "super_admin" && m.scope_type === "platform" && m.status === "active");
  const roles = ["admin", "support", "read_only_analyst", ...(isSuper ? ["super_admin"] : [])].map(value => ({ value, label: value.replaceAll("_", " "), description: "Platform access is granted only after the invited person verifies their email and accepts." }));
  return <>
    <header className="topbar"><Brand /><Link href="/admin">Back to operations</Link></header>
    <main className="page-wrap">
      <PageHeader eyebrow="Platform operations" title="Platform invitations" description="Provision platform roles and inspect invitation delivery and activation. Institution and Employer provisioning use the same scoped invitation API." />
      <InvitationManager initial={await listUserInvitations({})} roles={roles} scopes={[{ scopeType: "platform", scopeId: null, label: "TXKPRO platform" }]} title="Invite platform staff" description="Access remains limited to the role recorded on each invitation." />
    </main>
  </>;
}
