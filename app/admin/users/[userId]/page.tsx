import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { isPlatformSuperAdmin } from "@/lib/institutions";
import { getPlatformAccount, listPendingSupportInvitations } from "@/lib/admin/platform-users";
import { PlatformUserSupport } from "@/components/admin/platform-user-support";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PlatformUserDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const actor = await requireRole(["admin"]);
  if (!isPlatformSuperAdmin(actor)) notFound();
  const { userId } = await params;
  const target = await getPlatformAccount(userId);
  if (!target) notFound();
  const invitations = await listPendingSupportInvitations(target);

  return <main className="page-wrap">
    <p className="txk-admin-small"><Link href="/admin/users">All users</Link> / Account detail</p>
    <div className="page-heading"><div><p className="eyebrow">Super Admin / account support</p>
      <h1>{target.name}</h1><p className="card-sub">{target.email ?? "No email address"} · {target.status}</p>
    </div></div>
    <div className="card">
      <h2>Identity and active scopes</h2>
      <p>Account status: <strong>{target.status}</strong> · Email verified: <strong>{target.emailVerified ? "Yes" : "No"}</strong></p>
      <p className="txk-admin-small">Created {new Date(target.createdAt).toLocaleDateString()} · Last sign in {target.lastSignInAt ? new Date(target.lastSignInAt).toLocaleDateString() : "Never"}</p>
      {target.memberships.length
        ? <ul>{target.memberships.map(m => <li key={m.key}>{m.role} · {m.scopeType}{m.scopeId ? " / " + m.scopeId : ""} · {m.status}</li>)}</ul>
        : <p>No role memberships currently linked to this identity.</p>}
    </div>
    <PlatformUserSupport target={target} invitations={invitations} />
  </main>;
}
