import Link from "next/link";
import { notFound } from "next/navigation";
import { Brand } from "@/components/brand";
import { PageHeader } from "@/components/design-system";
import { InstitutionCreateForm } from "@/components/admin/institution-create-form";
import { InvitationManager } from "@/components/invitations/invitation-manager";
import { requireRole } from "@/lib/auth";
import { isPlatformSuperAdmin } from "@/lib/institutions";
import { listUserInvitations } from "@/lib/invitations/service";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
type Institution = { institution_id: string; name: string; city: string | null; state: string | null; active: boolean };
type AccessRequest = { request_id: string; contact_name: string; email: string; requested_role: string; intent: string; organization_name: string | null; message: string | null; status: string; created_at: string };

export default async function AdminInstitutionsPage() {
  const account = await requireRole(["admin"]);
  if (!isPlatformSuperAdmin(account)) notFound();
  const supabase = await createServerSupabaseClient();
  const [institutionsResult, requestsResult] = await Promise.all([
    supabase.rpc("platform_institutions_list"), supabase.rpc("platform_access_requests_list"),
  ]);
  if (institutionsResult.error || requestsResult.error) throw new Error("Institution administration is unavailable. Please try again shortly.");
  const institutions = (institutionsResult.data ?? []) as Institution[];
  const requests = (requestsResult.data ?? []) as AccessRequest[];
  const scopes = institutions.filter(i => i.active).map(i => ({ scopeType: "institution", scopeId: i.institution_id, institutionId: i.institution_id, label: i.name }));
  const roles = ["institution_admin", "institution_super_admin"].map(value => ({ value, label: value.replaceAll("_", " "), description: "Institution-wide administration, activated only after invitation acceptance." }));
  return <>
    <header className="topbar"><Brand /><Link href="/admin">Back to operations</Link></header>
    <main className="page-wrap">
      <PageHeader eyebrow="Internal Super Admin" title="Institutions and access requests" description="Create institutions, review demo/access requests, and invite institution administrators." />
      <InstitutionCreateForm />
      <section className="txk-section"><h2>Institution directory</h2>
        {institutions.length ? <ul>{institutions.map(i => <li key={i.institution_id}><strong>{i.name}</strong> — {[i.city, i.state].filter(Boolean).join(", ") || "Location not provided"} · {i.active ? "Active" : "Inactive"}</li>)}</ul> : <p>No institutions yet. Create one above.</p>}
      </section>
      {scopes.length ? <InvitationManager key={scopes.map(s => s.scopeId).join(",")} initial={await listUserInvitations({})} roles={roles} scopes={scopes} title="Invite institution administrators" description="Choose the institution and approved administrative role. Other institution staff are invited from their institution workspace." /> : null}
      <section className="txk-section"><h2>Latest demo/access requests</h2><p>Review the request and contact the person before provisioning access. Requests create no account or institution.</p>
        {requests.length ? requests.map(r => <article className="card" key={r.request_id}>
          <h3>{r.contact_name}</h3><p>{r.email} · {r.requested_role} · {r.intent} · {r.status}</p>
          {r.organization_name ? <p>{r.organization_name}</p> : null}{r.message ? <p style={{ whiteSpace: "pre-wrap" }}>{r.message}</p> : null}
          <p className="muted">Received {new Date(r.created_at).toISOString().slice(0, 10)}</p>
        </article>) : <p>No demo/access requests yet.</p>}
      </section>
    </main>
  </>;
}
