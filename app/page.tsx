import Link from "next/link";
import { Brand } from "@/components/brand";

export default function HomePage() {
  return (
    <>
      <header className="topbar">
        <Brand />
        <nav className="topnav">
          <Link className="nav-link" href="/demo/student">Student</Link>
          <Link className="nav-link" href="/demo/educator">Educator</Link>
          <Link className="nav-link" href="/demo/employer">Employer</Link>
        </nav>
        <Link className="button button-dark button-small" href="/login">Sign in</Link>
      </header>
      <main className="page-wrap hero">
        <section>
          <p className="eyebrow">Texarkana skilled workforce network</p>
          <h1>Skills verified. Talent ready. Careers retained.</h1>
          <p>
            TXKPRO Workforce connects local students, instructors, and home-service employers around verified technical skills, job-readiness requirements, and the first 90 days of employment.
          </p>
          <div className="hero-actions">
            <Link className="button button-brand" href="/demo/employer">Explore local talent</Link>
            <Link className="button button-ghost" href="/demo/educator">Preview instructor tools</Link>
          </div>
        </section>
        <aside className="hero-card">
          <p className="eyebrow" style={{ color: "#98d7b5" }}>Minimum viable ecosystem</p>
          <h2>One loop of value for all three sides.</h2>
          <div className="hero-flow">
            <div><small>01 — Student</small><strong>Build a living skills profile</strong></div>
            <div><small>02 — Educator</small><strong>Verify + refer in one click</strong></div>
            <div><small>03 — Employer</small><strong>Filter job-ready local talent</strong></div>
            <div><small>04 — TXKPRO</small><strong>Catch 30/60/90-day retention risk</strong></div>
          </div>
        </aside>
      </main>
    </>
  );
}
