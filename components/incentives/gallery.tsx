"use client";
import { useState } from "react";
import Link from "next/link";
import { PlusIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import type { Program } from "@/lib/pro-points/types";
import type { Configuration } from "@/lib/incentives/contracts";
export function programStatus(p: Program, c?: Configuration) {
  return c?.archived
    ? "archived"
    : c?.paused
      ? "paused"
      : p.status === "ended" ||
          (p.status === "active" && Date.parse(p.endsAt) <= Date.now())
        ? "expired"
        : p.status === "active" && Date.parse(p.startsAt) > Date.now()
          ? "scheduled"
          : p.status;
}
const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    n / 100,
  );
export function ProgramGallery({
  programs,
  configs,
  canCreate,
  financials = {},
}: {
  programs: Program[];
  configs: Configuration[];
  canCreate: boolean;
  financials?: Record<string, { committedCents: number; issuedCents: number }>;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [blueprint, setBlueprint] = useState("all");
  const [sort, setSort] = useState("updated");
  const config = (id: string) => configs.find((c) => c.programId === id);
  const items = programs
    .filter((p) => {
      const c = config(p.id);
      const d = c?.published ?? c?.draft;
      return (
        (status === "all" || programStatus(p, c) === status) &&
        (blueprint === "all" || d?.blueprint === blueprint) &&
        [
          p.name,
          d?.description,
          d?.trade,
          ...(d?.teams.map((t) => t.name) ?? []),
        ]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase())
      );
    })
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "ending"
          ? Date.parse(a.endsAt) - Date.parse(b.endsAt)
          : sort === "budget"
            ? (config(b.id)?.draft.budgetCents ?? 0) -
              (config(a.id)?.draft.budgetCents ?? 0)
            : Date.parse(config(b.id)?.updatedAt ?? b.startsAt) -
              Date.parse(config(a.id)?.updatedAt ?? a.startsAt),
    );
  const participants = new Set(
    items.flatMap((p) => p.participants.map((r) => r.userId ?? r.id)),
  );
  return (
    <>
      <div className="student-section-heading">
        <div>
          <h1>Incentive programs</h1>
          <p className="card-sub">
            Recognize contributions. Build stronger crews.
          </p>
        </div>
        <div className="reward-actions">
          <Link
            className="button secondary"
            href="/employer/incentives/templates"
          >
            Templates
          </Link>
          {canCreate && (
            <Link className="button" href="/employer/incentives/new">
              <PlusIcon width={18} /> Create program
            </Link>
          )}
        </div>
      </div>
      <div className="incentive-stats" aria-label="Filtered program totals">
        <article className="card">
          <span>Programs</span>
          <strong>{items.length}</strong>
        </article>
        <article className="card">
          <span>Active</span>
          <strong>
            {
              items.filter((p) => programStatus(p, config(p.id)) === "active")
                .length
            }
          </strong>
        </article>
        <article className="card">
          <span>Unique participants</span>
          <strong>{participants.size}</strong>
        </article>
        <article className="card">
          <span>Planned budget · USD</span>
          <strong>
            {usd(
              items.reduce(
                (n, p) => n + (config(p.id)?.draft.budgetCents ?? 0),
                0,
              ),
            )}
          </strong>
        </article>
      </div>
      <div className="incentive-stats">
        <article className="card">
          <span>Awarded + reserved · USD</span>
          <strong>
            {usd(
              items.reduce(
                (n, p) => n + (financials[p.id]?.committedCents ?? 0),
                0,
              ),
            )}
          </strong>
        </article>
        <article className="card">
          <span>Issued · USD</span>
          <strong>
            {usd(
              items.reduce(
                (n, p) => n + (financials[p.id]?.issuedCents ?? 0),
                0,
              ),
            )}
          </strong>
        </article>
      </div>
      <p className="card-sub">
        Summaries reflect the filters below. Enrollment counts are per program;
        planned budgets are not funded or spent amounts.
      </p>
      <div className="incentive-filters">
        <label>
          <span>Search programs</span>
          <div className="incentive-search">
            <MagnifyingGlassIcon width={18} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name, trade or crew"
            />
          </div>
        </label>
        <label>
          <span>Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {[
              "all",
              "draft",
              "scheduled",
              "active",
              "paused",
              "expired",
              "archived",
              "cancelled",
            ].map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "All statuses" : s}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Blueprint</span>
          <select
            value={blueprint}
            onChange={(e) => setBlueprint(e.target.value)}
          >
            {[
              "all",
              "quality",
              "delivery",
              "safety",
              "recognition",
              "retention",
              "combined",
            ].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="updated">Recently updated</option>
            <option value="name">Name</option>
            <option value="ending">Ending soon</option>
            <option value="budget">Planned budget</option>
          </select>
        </label>
      </div>
      <p role="status">{items.length} programs</p>
      <div className="incentive-gallery">
        {items.map((p) => {
          const c = config(p.id);
          const d = c?.published ?? c?.draft;
          return (
            <Link
              className="card incentive-program-card"
              href={`/employer/incentives/${p.id}`}
              key={p.id}
            >
              <div className="student-section-heading">
                <span className="pill">{programStatus(p, c)}</span>
                <span className="card-sub">
                  {d?.blueprint ?? p.template.replaceAll("_", " ")}
                </span>
              </div>
              <h2>{p.name}</h2>
              <p>{d?.description || "Private employer incentive program"}</p>
              <p className="card-sub">
                {d?.teams.length ?? 0} crews · {p.participants.length} members
              </p>
              <p className="card-sub">
                {new Date(p.startsAt).toLocaleDateString()} –{" "}
                {new Date(p.endsAt).toLocaleDateString()}
              </p>
              <div className="student-section-heading">
                <span>
                  {d
                    ? `${usd(d.budgetCents)} planned`
                    : "Budget not configured"}
                </span>
                <span>Open program →</span>
              </div>
              {d?.milestones[0] && (
                <p className="card-sub">Milestone: {d.milestones[0].title}</p>
              )}
            </Link>
          );
        })}
      </div>
      {!items.length && (
        <section className="card empty">
          <h2>No matching programs</h2>
          <p>Adjust your filters or create a program to get started.</p>
        </section>
      )}
    </>
  );
}
