import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { isPlatformSuperAdmin } from "@/lib/institutions";
import { MgidConnectionCheck } from "@/components/admin/mgid-connection-check";

export const dynamic = "force-dynamic";

export default async function MgidIntegrationPage() {
  const account = await requireRole(["admin"]);
  if (!isPlatformSuperAdmin(account)) notFound();
  if (process.env.VERCEL_ENV !== "preview" || process.env.VERCEL_GIT_COMMIT_REF !== "staging") notFound();

  return (
    <main className="page-wrap">
      <p><Link href="/admin">Back to administration</Link></p>
      <div className="page-heading">
        <div>
          <p className="eyebrow">TXKPRO operations / Integrations</p>
          <h1>MGID publisher API</h1>
          <p className="card-sub">Private, staging-only authentication check for the publisher reporting API.</p>
        </div>
      </div>
      <MgidConnectionCheck />
      <p className="card-sub" style={{ marginTop: 16 }}>
        A successful report API check does not enable native auctions or verify
        MGID OpenRTB S2S permissions. External-network ad delivery remains disabled.
      </p>
    </main>
  );
}
