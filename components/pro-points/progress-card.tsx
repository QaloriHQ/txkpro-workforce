"use client";
import Link from "next/link";
import { ActionModal } from "@/components/design-system/action-modal";
import type { Summary } from "@/lib/pro-points/types";
export function ProgressCard({
  summary,
  owner = false,
}: {
  summary: Summary | null;
  owner?: boolean;
}) {
  if (!summary || (!summary.progress && !summary.badges.length)) return null;
  const p = summary.progress;
  return (
    <section className="card pro-progress-card">
      {p ? (
        <>
          <div className="student-section-heading">
            <h2>PRO Points · Level {p.level}</h2>
            {owner ? (
              <Link className="button" href="/student/points">
                View activity
              </Link>
            ) : null}
          </div>
          <div className="pro-metrics">
            <div>
              <strong>{p.points.toLocaleString()}</strong>
              <span>Seasonal points</span>
            </div>
            <div>
              <strong>{p.lifetime.toLocaleString()}</strong>
              <span>Lifetime points</span>
            </div>
            <ActionModal
              title="Seasonal rankings"
              triggerLabel={`${p.preferredScope === "txkpro" ? "TXKPRO" : p.preferredScope} rank: ${p.rankings?.[p.preferredScope] ?? "Unassigned"}`}
            >
              <p>
                Same scoring rules across every scope. Tied scores share a rank.
              </p>
              <dl className="pro-ranking-list">
                {(["cohort", "institution", "txkpro"] as const).map((s) => (
                  <div key={s}>
                    <dt>{s === "txkpro" ? "TXKPRO" : s}</dt>
                    <dd>{p.rankings?.[s] ?? "Unassigned"}</dd>
                  </div>
                ))}
              </dl>
              {owner ? (
                <Link href="/student/profile/edit">
                  Choose default ranking in your profile editor
                </Link>
              ) : null}
            </ActionModal>
          </div>
          <p className="card-sub">
            Season: {p.season} to {p.seasonEnds} · America/Chicago. Lifetime
            levels persist between seasons.
          </p>
          <div className="pro-streaks">
            {p.streaks.map((s) => (
              <div key={s.family}>
                <strong>{s.family.replace("_", " ")} streak</strong>
                <span>
                  {s.available
                    ? `${s.current} current · ${s.longest} longest`
                    : "Coming soon"}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : null}
      {summary.badges.length ? (
        <>
          <h3>TXKPRO System badges</h3>
          <div className="pro-badges">
            {summary.badges.map((b) => (
              <span className="pill" key={`${b.family}-${b.tier}`}>
                {b.family.replace("_", " ")} · {b.tier} days
              </span>
            ))}
          </div>
          <p className="card-sub">
            Issued by TXKPRO System. Activity achievements are separate from
            verified trade credentials.
          </p>
        </>
      ) : null}
      {owner ? (
        <p className="card-sub">
          Sharing is controlled in your{" "}
          <Link href="/student/profile/edit">profile editor</Link>. Private
          program scores stay inside their program.
        </p>
      ) : null}
    </section>
  );
}
