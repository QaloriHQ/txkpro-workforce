"use client";
import { useState } from "react";
import Link from "next/link";
import {
  MagnifyingGlassIcon,
  AdjustmentsHorizontalIcon,
  ArrowRightIcon,
  EyeIcon,
} from "@heroicons/react/24/outline";
import { ActionModal } from "@/components/design-system/action-modal";
import { ButtonLink } from "@/components/design-system/primitives";
import type {
  IncentiveTemplate,
  EmployerSize,
} from "@/lib/incentives/templates";
import type { Blueprint } from "@/lib/incentives/contracts";
const usd = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);

function TemplateRules({ template: t }: { template: IncentiveTemplate }) {
  return (
    <div className="incentive-template-rules">
      <h3>Milestones & approvals</h3>
      {t.definition.milestones.map((m) => (
        <section key={m.id}>
          <h4>{m.title}</h4>
          <p>
            {m.points.toLocaleString()} points ·{" "}
            {m.recipient === "crew"
              ? "equal individual crew shares"
              : "individual"}{" "}
            ·{" "}
            {m.repeat === "once"
              ? "one-time milestone"
              : "each distinct verified source"}
          </p>
          <ul>
            {m.conditions.map((c, i) => (
              <li key={i}>
                {c.metric.replaceAll("_", " ")}{" "}
                {c.operator === "gte" ? "at least" : "at most"} {c.value}
              </li>
            ))}
          </ul>
          <p className="card-sub">
            {m.approval === "safety_then_manager"
              ? "Separate safety → manager approval"
              : "Independent manager review"}
            {m.safetyRequired ? " · safety and quality checks required" : ""}
          </p>
        </section>
      ))}
      <h3>Evidence</h3>
      <p>{t.evidence}</p>
      <h3>Reward policy</h3>
      <p>
        {t.definition.creditsPerBlock} points ={" "}
        {usd(t.definition.centsPerBlock)} · ordinary minimum{" "}
        {t.definition.minimumCredits} points. Earned points{" "}
        {t.definition.expiryMonths
          ? `expire after ${t.definition.expiryMonths} months`
          : "remain available indefinitely"}
        ; after employment ends, original availability continues.
      </p>
      <p>
        {t.definition.givingAllowance.toLocaleString()} monthly points to give ·{" "}
        {t.definition.recipientMonthlyCap.toLocaleString()} recipient cap ·{" "}
        {t.definition.safetyPoints.toLocaleString()} verified hazard points,
        banked with immediate redemption available.
      </p>
      <p>
        Employer timezone: {t.definition.timezone}. Dates start when you use the
        template. In-app notices; email off. Recognition{" "}
        {t.definition.publicRecognition
          ? "offered with separate employee opt-in"
          : "not offered"}
        .
      </p>
      <h3>Employee-facing terms</h3>
      <p className="portfolio-text">{t.definition.terms}</p>
      <h3>Before activation</h3>
      <p>
        Review company-specific rules, publish, configure sandbox execution
        before employee acceptance, assign enrolled members to crews, allocate
        confirmed funding and verify source mappings. Required reviewers and any
        perks must be assigned separately.
      </p>
    </div>
  );
}

export function TemplateGallery({
  templates,
  canCreate,
  sizes: EMPLOYER_SIZES,
  goals: PROGRAM_GOALS,
}: {
  templates: readonly IncentiveTemplate[];
  canCreate: boolean;
  sizes: Record<EmployerSize, string>;
  goals: Record<Blueprint, string>;
}) {
  const [search, setSearch] = useState("");
  const [size, setSize] = useState("all");
  const [goal, setGoal] = useState("all");
  const [sort, setSort] = useState("recommended");
  const items = templates
    .filter(
      (t) =>
        (size === "all" || t.size === size) &&
        (goal === "all" || t.goal === goal) &&
        [
          t.name,
          t.description,
          t.trade,
          PROGRAM_GOALS[t.goal],
          EMPLOYER_SIZES[t.size],
        ]
          .join(" ")
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "budget"
          ? a.definition.budgetCents - b.definition.budgetCents
          : 0,
    );
  return (
    <>
      <div className="student-section-heading">
        <div>
          <span className="pill">Employer incentive library</span>
          <h1>Start with a clear plan</h1>
          <p className="card-sub">
            54 editable templates. Six goals. A practical starting point for
            every team size.
          </p>
        </div>
        {canCreate && (
          <Link className="button secondary" href="/employer/incentives/new">
            Start from scratch
          </Link>
        )}
      </div>
      <section className="card incentive-template-intro">
        <AdjustmentsHorizontalIcon width={28} aria-hidden="true" />
        <div>
          <h2>Your team. Your rules.</h2>
          <p>
            Choose a template, inspect the complete rules, then customize in
            Guided Setup or the Advanced Editor. Employer size is a
            recommendation; every template and editor is available to every
            employer.
          </p>
          <p className="card-sub">
            Budgets are editable examples, not funding commitments. Review
            dates, company policies, crew membership and catalog eligibility
            before publication. Templates never enroll employees, enable payouts
            or overwrite a saved program.
          </p>
        </div>
      </section>
      <div className="incentive-filters">
        <label>
          <span>Search templates</span>
          <div className="incentive-search">
            <MagnifyingGlassIcon width={18} aria-hidden="true" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Goal, trade or template name"
            />
          </div>
        </label>
        <label>
          <span>Employer size</span>
          <select value={size} onChange={(e) => setSize(e.target.value)}>
            <option value="all">All employer sizes</option>
            {Object.entries(EMPLOYER_SIZES).map(([id, label]) => (
              <option value={id} key={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Program goal</span>
          <select value={goal} onChange={(e) => setGoal(e.target.value)}>
            <option value="all">All program goals</option>
            {Object.entries(PROGRAM_GOALS).map(([id, label]) => (
              <option value={id} key={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="recommended">By employer size & goal</option>
            <option value="name">Name A–Z</option>
            <option value="budget">Example budget: low to high</option>
          </select>
        </label>
      </div>
      <p role="status" aria-live="polite">
        {items.length} of {templates.length} templates · 3 per goal in each
        employer size
      </p>
      <div className="incentive-gallery">
        {items.map((t) => (
          <article className="card incentive-template-card" key={t.id}>
            <div className="incentive-template-meta">
              <span className="pill">{PROGRAM_GOALS[t.goal]}</span>
              <span className="card-sub">{EMPLOYER_SIZES[t.size]}</span>
            </div>
            <h2>{t.name}</h2>
            <p>{t.description}</p>
            <p className="card-sub">{t.trade}</p>
            <dl className="incentive-template-summary">
              <div>
                <dt>Example budget</dt>
                <dd>{usd(t.definition.budgetCents)}</dd>
              </div>
              <div>
                <dt>Milestones</dt>
                <dd>{t.definition.milestones.length}</dd>
              </div>
              <div>
                <dt>Duration</dt>
                <dd>{t.durationDays} days</dd>
              </div>
              <div>
                <dt>Recommended setup</dt>
                <dd>
                  {t.recommendedMode === "guided" ? "Guided" : "Advanced"}
                </dd>
              </div>
            </dl>
            <div className="incentive-template-actions">
              <ActionModal
                title={`${t.name} rules`}
                triggerLabel={`Preview ${t.name} rules`}
                triggerContent={
                  <>
                    <EyeIcon aria-hidden="true" /> Preview
                  </>
                }
                description="Review the complete editable rules before choosing this template."
                triggerClassName="txk-button txk-button-secondary txk-button-md"
                className="incentive-template-rules-dialog"
                closeLabel="Close"
                footerActions={
                  canCreate ? (
                    <ButtonLink
                      tone="primary"
                      href={`/employer/incentives/new?template=${t.id}`}
                    >
                      Use template
                      <ArrowRightIcon aria-hidden="true" />
                    </ButtonLink>
                  ) : undefined
                }
              >
                <TemplateRules template={t} />
              </ActionModal>
              {canCreate ? (
                <ButtonLink
                  tone="primary"
                  href={`/employer/incentives/new?template=${t.id}`}
                >
                  Use template <ArrowRightIcon aria-hidden="true" />
                </ButtonLink>
              ) : (
                <p className="card-sub">
                  An employer owner or admin can create programs.
                </p>
              )}
            </div>
          </article>
        ))}
      </div>
      {!items.length && (
        <section className="card empty">
          <h2>No matching templates</h2>
          <p>Try another goal, employer size or search term.</p>
          <button
            className="button secondary"
            onClick={() => {
              setSearch("");
              setSize("all");
              setGoal("all");
            }}
          >
            Clear filters
          </button>
        </section>
      )}
    </>
  );
}
