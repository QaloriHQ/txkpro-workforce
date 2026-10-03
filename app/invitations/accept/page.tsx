import { Brand } from "@/components/brand";
import { InvitationAcceptance } from "@/components/invitations/invitation-acceptance";
import { ThemeToggle } from "@/components/theme-toggle";

export const dynamic = "force-dynamic";

export default async function InvitationAcceptPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const params = await searchParams;
  const invitationId = params.id?.trim() ?? "";

  return (
    <>
      <header className="topbar">
        <Brand />
        <div className="header-actions">
          <ThemeToggle />
        </div>
      </header>
      <main className="page-wrap txk-prototype-content">
        <div className="onboarding-layout">
          <section className="onboarding-panel">
            {invitationId ? (
              <InvitationAcceptance invitationId={invitationId} />
            ) : (
              <>
                <p className="eyebrow">TXKPRO Workforce invitation</p>
                <h1>Invitation link is incomplete</h1>
                <p className="muted">
                  Open the complete invitation link from the email you received.
                </p>
              </>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
