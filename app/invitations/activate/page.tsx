import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { ActivationLoader } from "@/components/invitations/activation-loader";
import { ThemeToggle } from "@/components/theme-toggle";

export const dynamic = "force-dynamic";

export default async function InvitationActivationPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  const invitationId = typeof id === "string" ? id.trim() : "";
  if (!invitationId) redirect("/auth/error?flow=confirmation&code=missing_invitation");

  return (
    <main className="auth-wrap">
      <section className="auth-card">
        <div className="auth-toolbar">
          <Brand />
          <ThemeToggle />
        </div>
        <h1>Activate your TXKPRO access</h1>
        <p>
          Review the organization, role, and scope that were assigned by the
          authorized inviter, then accept to activate this membership.
        </p>
        <ActivationLoader invitationId={invitationId} />
        <p className="footer-note">
          Identity is not authority. TXKPRO activates only the server-stored
          role and scope tied to this invitation.
        </p>
      </section>
    </main>
  );
}
