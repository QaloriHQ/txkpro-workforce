"use client";
/* Event cover images are user uploads served through the Community media route. */
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import {
  CalendarDaysIcon,
  ChartBarSquareIcon,
  MapPinIcon,
  MagnifyingGlassIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import type { StudentEventGalleryItem, StudentPollGalleryItem } from "@/lib/community/student-gallery-repository";

import { SponsoredPlacement } from "@/components/ads/sponsored-placement";

type EventFilter = "upcoming" | "mine" | "going" | "interested" | "past";
type PollFilter = "open" | "voted" | "mine" | "closed";

const eventFilters: { value: EventFilter; label: string }[] = [
  { value: "upcoming", label: "Upcoming" },
  { value: "mine", label: "My events" },
  { value: "going", label: "Going" },
  { value: "interested", label: "Interested" },
  { value: "past", label: "Past" },
];

const pollFilters: { value: PollFilter; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "voted", label: "Voted" },
  { value: "mine", label: "My polls" },
  { value: "closed", label: "Closed" },
];

function SearchAndFilters<T extends string>({
  query,
  setQuery,
  selected,
  setSelected,
  filters,
  label,
}: {
  query: string;
  setQuery: (value: string) => void;
  selected: T;
  setSelected: (value: T) => void;
  filters: { value: T; label: string }[];
  label: string;
}) {
  return <section className="student-discovery-controls" aria-label={`${label} search and filters`}>
    <label className="student-discovery-search">
      <span className="sr-only">Search {label.toLowerCase()}</span>
      <MagnifyingGlassIcon aria-hidden="true" />
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${label.toLowerCase()}…`} />
    </label>
    <div className="student-discovery-filters" role="group" aria-label={`Filter ${label.toLowerCase()}`}>
      {filters.map((filter) => <button
        key={filter.value}
        type="button"
        aria-pressed={selected === filter.value}
        onClick={() => setSelected(filter.value)}
      >{filter.label}</button>)}
    </div>
  </section>;
}

function EventDate({ event }: { event: StudentEventGalleryItem }) {
  const date = new Date(event.startsAt);
  const formatted = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: event.timezone,
  }).format(date);
  return <time dateTime={event.startsAt}>{formatted}</time>;
}

export function StudentEventGallery({ items, nowIso }: { items: StudentEventGalleryItem[]; nowIso: string }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<EventFilter>("upcoming");
  const now = new Date(nowIso).getTime();
  const normalizedQuery = query.trim().toLowerCase();
  const visible = useMemo(() => items.filter((event) => {
    const ended = new Date(event.endsAt).getTime() <= now || event.status === "completed" || event.status === "cancelled";
    const matchesFilter = filter === "upcoming" ? !ended : filter === "past" ? ended : filter === "mine" ? event.isOwn : event.viewerRsvp === filter;
    const location = event.locationType === "online" ? "online" : [event.venueName, event.address].filter(Boolean).join(" ");
    const matchesSearch = !normalizedQuery || [event.title, event.description, event.organizerName, location].join(" ").toLowerCase().includes(normalizedQuery);
    return matchesFilter && matchesSearch;
  }).sort((left, right) => {
    const leftTime = new Date(left.startsAt).getTime();
    const rightTime = new Date(right.startsAt).getTime();
    return filter === "past" ? rightTime - leftTime : leftTime - rightTime;
  }), [filter, items, normalizedQuery, now]);

  return <>
    <SearchAndFilters query={query} setQuery={setQuery} selected={filter} setSelected={setFilter} filters={eventFilters} label="Events" />
    {visible.length ? <section className="student-discovery-grid" aria-label="Event results">
      {visible.map((event, index) => <Fragment key={event.id}><article className="student-discovery-card student-event-card" key={event.id}>
        {event.coverUrl ? <img className="student-event-cover" src={event.coverUrl} alt="" /> : <div className="student-event-cover student-event-cover-fallback"><CalendarDaysIcon aria-hidden="true" /></div>}
        <div className="student-discovery-card-body">
          <div className="student-discovery-card-kicker"><span>{event.status === "published" ? "Event" : event.status}</span>{event.isOwn ? <span>Created by you</span> : null}</div>
          <h2>{event.title}</h2>
          <p className="student-discovery-summary">{event.description}</p>
          <dl className="student-event-facts">
            <div><dt><CalendarDaysIcon aria-hidden="true" /><span className="sr-only">When</span></dt><dd><EventDate event={event} /></dd></div>
            <div><dt><MapPinIcon aria-hidden="true" /><span className="sr-only">Where</span></dt><dd>{event.locationType === "online" ? "Online" : [event.venueName, event.address].filter(Boolean).join(" · ")}</dd></div>
            <div><dt><UserGroupIcon aria-hidden="true" /><span className="sr-only">RSVP totals</span></dt><dd>{event.counts.going} going · {event.counts.interested} interested</dd></div>
          </dl>
          <Link className="student-discovery-card-link" href={`/events/${event.id}`}>View event</Link>
        </div>
      </article>{index === 2 ? <SponsoredPlacement placement="in_feed" itemCount={visible.length} listKind="events" listItemIds={visible.map(item => item.id)} /> : null}</Fragment>)}
    </section> : <DiscoveryEmpty label="events" filtered={Boolean(normalizedQuery) || filter !== "upcoming"} onReset={() => { setQuery(""); setFilter("upcoming"); }} />}
  </>;
}

export function StudentPollGallery({ items, nowIso }: { items: StudentPollGalleryItem[]; nowIso: string }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PollFilter>("open");
  const now = new Date(nowIso).getTime();
  const normalizedQuery = query.trim().toLowerCase();
  const visible = useMemo(() => items.filter((poll) => {
    const closed = poll.status !== "open" || new Date(poll.closesAt).getTime() <= now;
    const matchesFilter = filter === "open" ? !closed : filter === "closed" ? closed : filter === "mine" ? poll.isOwn : poll.viewerVoted;
    const matchesSearch = !normalizedQuery || [poll.question, ...poll.options.map((option) => option.label)].join(" ").toLowerCase().includes(normalizedQuery);
    return matchesFilter && matchesSearch;
  }).sort((left, right) => new Date(right.closesAt).getTime() - new Date(left.closesAt).getTime()), [filter, items, normalizedQuery, now]);

  return <>
    <SearchAndFilters query={query} setQuery={setQuery} selected={filter} setSelected={setFilter} filters={pollFilters} label="Polls" />
    {visible.length ? <section className="student-discovery-grid" aria-label="Poll results">
      {visible.map((poll, index) => {
        const closed = poll.status !== "open" || new Date(poll.closesAt).getTime() <= now;
        return <Fragment key={poll.id}><article className="student-discovery-card student-poll-card" key={poll.id}>
          <div className="student-poll-icon"><ChartBarSquareIcon aria-hidden="true" /></div>
          <div className="student-discovery-card-body">
            <div className="student-discovery-card-kicker"><span>{closed ? "Closed" : "Open poll"}</span>{poll.isOwn ? <span>Created by you</span> : poll.viewerVoted ? <span>Voted</span> : null}</div>
            <h2>{poll.question}</h2>
            <ul className="student-poll-preview">{poll.options.slice(0, 3).map((option) => <li key={option.id}><span>{option.label}</span>{option.votes === null ? null : <strong>{option.votes}</strong>}</li>)}</ul>
            {poll.options.length > 3 ? <p className="student-poll-more">+{poll.options.length - 3} more option{poll.options.length - 3 === 1 ? "" : "s"}</p> : null}
            <p className="student-poll-meta">{poll.selectionMode === "single" ? "Choose one" : `Choose up to ${poll.maxSelections}`} · {poll.totalBallots} response{poll.totalBallots === 1 ? "" : "s"}</p>
            <Link className="student-discovery-card-link" href={`/polls/${poll.id}`}>{closed || poll.viewerVoted ? "View results" : "Vote now"}</Link>
          </div>
        </article>{index === 2 ? <SponsoredPlacement placement="in_feed" itemCount={visible.length} listKind="polls" listItemIds={visible.map(item => item.id)} /> : null}</Fragment>;
      })}
    </section> : <DiscoveryEmpty label="polls" filtered={Boolean(normalizedQuery) || filter !== "open"} onReset={() => { setQuery(""); setFilter("open"); }} />}
  </>;
}

function DiscoveryEmpty({ label, filtered, onReset }: { label: string; filtered: boolean; onReset: () => void }) {
  return <section className="student-discovery-empty">
    <MagnifyingGlassIcon aria-hidden="true" />
    <h2>{filtered ? `No matching ${label}` : `No ${label} yet`}</h2>
    <p>{filtered ? "Try another search or reset the filters." : `Create the first ${label.slice(0, -1)} to get the conversation started.`}</p>
    {filtered ? <button type="button" onClick={onReset}>Reset search and filters</button> : null}
  </section>;
}
