import { AccessRequestForm } from "@/components/access-request-form";
import { MarketingHeader } from "@/components/marketing-header";
import { MarketingFooter } from "@/components/marketing-footer";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Request demo or access | TXKPRO Workforce", robots: { index: false, follow: true } };

export default function RequestAccessPage() {
  return <><MarketingHeader /><main className="marketing-main">
    <section className="marketing-section marketing-shell">
      <p className="marketing-kicker">TXKPRO Workforce</p><h1>Request a demo or access</h1>
      <p className="marketing-lede">Tell us about your workforce needs. TXKPRO reviews requests and invites approved users.</p>
      <AccessRequestForm />
    </section>
  </main><MarketingFooter /></>;
}
