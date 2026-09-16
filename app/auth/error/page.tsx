import Link from "next/link";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ flow?: string; code?: string }>;
}) {
  const params = await searchParams;
  const recovery = params.flow === "recovery";
  const title = recovery ? "Recovery link unavailable" : "We couldn’t confirm that link";
  const copy = recovery
    ? "The password-recovery link may have expired, already been used, or opened in a different authentication flow. Request a new link and try again."
    : "The confirmation link may have expired, already been used, or been opened after the authentication request changed. You can sign in or request another verification email.";

  return (
    <main className="auth-wrap">
      <section className="auth-card">
        <div className="auth-toolbar"><Brand /><ThemeToggle /></div>
        <h1>{title}</h1>
        <p>{copy}</p>
        {params.code ? <div className="alert" style={{ marginTop: 16 }}>Reference: {params.code}</div> : null}
        <div className="hero-actions">
          {recovery ? (
            <Link className="button button-brand" href="/forgot-password">Request a new reset link</Link>
          ) : (
            <Link className="button button-brand" href="/login">Back to sign in</Link>
          )}
          <Link className="button button-ghost" href={recovery ? "/login" : "/signup"}>
            {recovery ? "Sign in" : "Create account"}
          </Link>
        </div>
      </section>
    </main>
  );
}
