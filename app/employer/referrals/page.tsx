import Link from "next/link";
import { Brand } from "@/components/brand";
import { EmployerWorkspaceNav } from "@/components/employer/workspace-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireEmployerContext } from "@/lib/employer/auth";
import { listReferrals } from "@/lib/employer/workflow-repository";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ReferralsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const context = await requireEmployerContext({ approved: true });
  const params = await searchParams;
  const status = one(params.status) ?? null;
  const referrals = await listReferrals(context, status);

  return (
    <>
      <header className="topbar">
        <Brand />
        <EmployerWorkspaceNav active="referrals" />
        <ThemeToggle />
        <SignOutButton />
      </header>
      <main className="page-wrap">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Employer · Referrals</p>
            <h1>Institution referrals</h1>
            <p className="card-sub">
              Referrals preserve the Institution-shared evidence snapshot and
              canonical referral lifecycle. Employer-private notes stay separate.
            </p>
          </div>
          <span className="pill pill-info">{referrals.length} referrals</span>
        </div>

        <div className="choice-row" style={{ marginBottom: 18 }}>
          {[
            ["", "All"],
            ["delivered", "New"],
            ["viewed", "Viewed"],
            ["interview_requested", "Interview Requested"],
            ["closed", "Closed"],
          ].map(([value, label]) => (
            <Link
              key={value}
              className={`choice-pill ${(status ?? "") === value ? "selected" : ""}`}
              href={value ? `/employer/referrals?status=${value}` : "/employer/referrals"}
            >
              {label}
            </Link>
          ))}
        </div>

        <div className="grid grid-2">
          {referrals.map((referral) => (
            <article className="card" key={referral.referralId}>
              <div className="card-header">
                <div>
                  <h2>{referral.studentName}</h2>
                  <p className="card-sub">
                    {referral.program ?? "Program"} · {referral.institutionName ?? "Institution"}
                  </p>
                </div>
                <span className={`pill ${referral.status === "delivered" ? "pill-warn" : "pill-info"}`}>
                  {referral.status.replaceAll("_", " ")}
                </span>
              </div>
              <div className="readiness-list">
                <div className="readiness-row"><span>Hiring Need</span><strong>{referral.hiringNeedTitle ?? "Direct referral"}</strong></div>
                <div className="readiness-row"><span>Trade</span><strong>{referral.primaryTradeId ?? "—"}</strong></div>
                <div className="readiness-row"><span>Referred</span><strong>{referral.referredAt ? new Date(referral.referredAt).toLocaleDateString() : "—"}</strong></div>
              </div>
              {referral.institutionSharedNote ? (
                <div className="callout" style={{ marginTop: 14 }}>
                  <strong>Institution-shared note</strong>
                  {referral.institutionSharedNote}
                </div>
              ) : null}
              <div className="hero-actions">
                <Link
                  className="button button-dark"
                  href={`/employer/referrals/${encodeURIComponent(referral.referralId)}`}
                >
                  Open Referral
                </Link>
              </div>
            </article>
          ))}
        </div>

        {!referrals.length ? (
          <div className="empty card">
            <strong>No referrals in this queue.</strong>
            Institution-created referrals will appear here when they are delivered.
          </div>
        ) : null}
      </main>
    </>
  );
}
