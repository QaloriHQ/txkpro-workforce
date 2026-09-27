import {
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { Card } from "@/components/design-system";
import { ThemeToggle } from "@/components/theme-toggle";

export default function CredentialNotFound() {
  return (
    <>
      <header className="topbar public-credential-topbar">
        <Brand />
        <nav className="topnav" aria-label="Public credential navigation">
          <Link className="nav-link active" href="/credentials">
            Verify credential
          </Link>
        </nav>
        <div className="header-actions">
          <ThemeToggle />
          <Link className="button button-ghost button-small" href="/login">
            Sign in
          </Link>
        </div>
      </header>

      <main className="page-wrap public-credential-page">
        <Card className="public-credential-not-found">
          <ExclamationTriangleIcon aria-hidden="true" />
          <div>
            <p className="txk-eyebrow">Credential verification</p>
            <h1>Credential not found</h1>
            <p>
              The credential ID or public URL could not be verified. The same
              response is used for unknown, private, and unpublished
              credentials so private Workforce records are not disclosed.
            </p>
            <Link className="button button-brand" href="/credentials">
              <MagnifyingGlassIcon aria-hidden="true" />
              Try another credential
            </Link>
          </div>
        </Card>
      </main>
    </>
  );
}
