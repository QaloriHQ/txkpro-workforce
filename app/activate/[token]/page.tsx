import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { Card, PageHeader } from "@/components/design-system";
import { ThemeToggle } from "@/components/theme-toggle";
import { getAccountContext } from "@/lib/auth";
import { acceptInvitation } from "@/lib/invitations/repository";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ token: string }>;
};

export default async function InvitationActivationPage({ params }: RouteContext) {
  const { token } = await params;
  const account = await getAccountContext();
  const activationPath = `/activate/${encodeURIComponent(token)}`;

  if (!account) {
    return (
      <main className="auth-wrap">
        <section className="auth-card auth-card-wide">
          <div className="auth-toolbar">
            <Brand />
            <ThemeToggle />
          </div>
          <h1>Activate your TXKPRO invitation</h1>
          <p>
            Sign in or create an account with the invited email address. TXKPRO
            will activate only the server-authorized role and scope attached to
            this invitation.
          </p>
          <div className="grid grid-2" style={{ marginTop: 18 }}>
            <Link
              className="button button-dark button-block"
              href={`/login?next=${encodeURIComponent(activationPath)}`}
            >
              Sign in to activate
            </Link>
            <Link
              className="button button-ghost button-block"
              href={`/signup?invite=${encodeURIComponent(token)}`}
            >
              Create account
            </Link>
          </div>
        </section>
      </main>
    );
  }

  let redirectTo: string | null = null;
  try {
    const result = await acceptInvitation(token);
    redirectTo = result.redirectTo || "/dashboard";
  } catch (error) {
    const message =
      error instanceof Response
        ? await error.text()
        : error instanceof Error
          ? error.message
          : "Unable to activate this invitation.";

    return (
      <>
        <header className="topbar">
          <Brand />
          <div className="header-actions">
            <ThemeToggle />
          </div>
        </header>
        <main className="page-wrap txk-prototype-content">
          <PageHeader
            eyebrow="Invitation activation"
            title="This invitation could not be activated"
            description="Invitation links are single-use, expire automatically, and must match the signed-in email address."
          />
          <Card>
            <p>{message}</p>
            <div className="txk-reference-row">
              <Link className="txk-button txk-button-primary txk-button-md" href="/dashboard">
                Go to dashboard
              </Link>
              <Link className="txk-button txk-button-default txk-button-md" href="/login">
                Sign in with another account
              </Link>
            </div>
          </Card>
        </main>
      </>
    );
  }

  redirect(redirectTo);
}
