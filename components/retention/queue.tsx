import Link from "next/link";
import { CalendarDaysIcon, UserCircleIcon } from "@heroicons/react/24/outline";
import {
  Card,
  EmptyState,
  PageHeader,
  StatusBadge,
} from "@/components/design-system";
import {
  CASE_LABELS,
  CASE_STATUSES,
  type RetentionFilters,
  type RetentionQueue,
} from "@/lib/retention/types";
import { RetentionTimestamp } from "./timestamp";

export function RetentionCaseQueue({
  queue,
  filters,
  basePath,
}: {
  queue: RetentionQueue;
  filters: RetentionFilters;
  basePath: string;
}) {
  function pageHref(offset: number) {
    const query = new URLSearchParams();
    for (const key of ["status", "owner", "q"] as const)
      if (filters[key]) query.set(key, filters[key]);
    query.set("offset", String(offset));
    return `${basePath}?${query}`;
  }
  return (
    <>
      <PageHeader
        eyebrow="Student support"
        title="Retention cases"
        description="Assign an owner, record contact, and follow up on Students who requested support."
      />
      <p className="callout">
        Cases and notes are internal to authorized Institution and TXKPRO teams.
        Case updates do not change employment or Verified Skills.
      </p>
      <form className="retention-filters" method="get">
        <label>
          Search
          <input
            type="search"
            name="q"
            defaultValue={filters.q}
            placeholder="Student, case, placement role"
            maxLength={100}
          />
        </label>
        <label>
          Status
          <select name="status" defaultValue={filters.status || "active"}>
            <option value="active">Active cases</option>
            {CASE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {CASE_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Owner
          <select name="owner" defaultValue={filters.owner || ""}>
            <option value="">All owners</option>
            <option value="mine">Assigned to me</option>
            <option value="unassigned">Unassigned</option>
          </select>
        </label>
        <button
          className="txk-button txk-button-primary txk-button-md"
          type="submit"
        >
          Filter
        </button>
        <Link
          className="txk-button txk-button-default txk-button-md"
          href={basePath}
        >
          Clear
        </Link>
      </form>
      <p>{queue.total} cases in your authorized scope</p>
      <div className="retention-case-grid">
        {queue.items.map((item) => (
          <Card key={item.caseId} className="retention-case-card">
            <div className="retention-card-heading">
              <UserCircleIcon aria-hidden="true" />
              <h2>
                <Link href={`${basePath}/${encodeURIComponent(item.caseId)}`}>
                  {item.studentName}
                </Link>
              </h2>
              <StatusBadge
                tone={item.severity === "urgent" ? "danger" : "warning"}
              >
                {item.severity} priority
              </StatusBadge>
            </div>
            <p>
              {item.roleTitle || "Placement"} ·{" "}
              {item.cohortName || "Cohort unavailable"}
            </p>
            <p>
              <StatusBadge>{CASE_LABELS[item.status]}</StatusBadge> ·{" "}
              {item.milestoneDay}-day Student pulse
            </p>
            <dl className="retention-facts">
              <div>
                <dt>Owner</dt>
                <dd>{item.ownerName || "Unassigned"}</dd>
              </div>
              <div>
                <dt>
                  <CalendarDaysIcon aria-hidden="true" /> Follow-up
                </dt>
                <dd>
                  <RetentionTimestamp
                    value={item.nextFollowUpAt}
                    empty="Not scheduled"
                  />
                </dd>
              </div>
              <div>
                <dt>Opened</dt>
                <dd>
                  <RetentionTimestamp value={item.openedAt} />
                </dd>
              </div>
            </dl>
            <div className="retention-card-footer">
              <small>{item.caseId}</small>
              <Link
                className="txk-button txk-button-default txk-button-sm"
                href={`${basePath}/${encodeURIComponent(item.caseId)}`}
              >
                Open case
              </Link>
            </div>
          </Card>
        ))}
      </div>
      {!queue.items.length ? (
        <Card>
          <EmptyState
            title="No cases match these filters"
            description="Clear filters to see active cases in your authorized scope."
          />
        </Card>
      ) : null}
      <nav aria-label="Retention case pages" className="retention-pagination">
        {queue.offset > 0 ? (
          <Link
            className="txk-button txk-button-default txk-button-md"
            href={pageHref(Math.max(0, queue.offset - queue.limit))}
          >
            Previous
          </Link>
        ) : null}
        {queue.offset + queue.items.length < queue.total ? (
          <Link
            className="txk-button txk-button-default txk-button-md"
            href={pageHref(queue.offset + queue.limit)}
          >
            Next
          </Link>
        ) : null}
      </nav>
    </>
  );
}
