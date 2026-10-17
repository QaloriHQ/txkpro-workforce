"use client";

import Image from "next/image";
import {
  FormEvent,
  useMemo,
  useState,
  type ComponentType,
  type SVGProps,
} from "react";
import {
  ArrowTrendingUpIcon,
  Bars3Icon,
  ChartBarIcon,
  ChatBubbleLeftRightIcon,
  CursorArrowRaysIcon,
  HomeIcon,
  MegaphoneIcon,
  PhotoIcon,
  PlusIcon,
  RectangleGroupIcon,
  ShieldCheckIcon,
  Squares2X2Icon,
  UserGroupIcon,
  UserPlusIcon,
  UsersIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type {
  AdAsset,
  AdvertiserAnalytics,
  AdvertiserCampaign,
  AdvertiserDashboard as DashboardData,
  BuyingModel,
  CreativeSet,
  Placement,
  SavedAudience,
} from "@/lib/advertiser/types";
import {
  AnalyticsPanel,
  CreativePreview,
  TeamPanel,
} from "@/components/advertiser/advertiser-dashboard";

type Tab =
  | "overview"
  | "campaigns"
  | "ad-groups"
  | "audiences"
  | "creatives"
  | "analytics"
  | "team"
  | "audit";
type Icon = ComponentType<SVGProps<SVGSVGElement>>;
const placements: Placement[] = [
  "in_feed",
  "in_comments",
  "in_article",
  "multiplex",
];
const placementLabels: Record<Placement, string> = {
  in_feed: "Community feed",
  in_comments: "Conversation",
  in_article: "Article",
  multiplex: "Workspace card",
};
const money = (minor: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    minor / 100,
  );
const dateValue = (value: string) =>
  value ? new Date(value).toISOString().slice(0, 10) : "";
async function mutate(payload: Record<string, unknown>) {
  const response = await fetch("/api/advertiser", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Request failed");
  return result;
}

const nav: Array<{
  group: string;
  items: Array<{ key: Tab; label: string; icon: Icon }>;
}> = [
  {
    group: "Workspace",
    items: [
      { key: "overview", label: "Overview", icon: HomeIcon },
      { key: "campaigns", label: "Campaigns", icon: MegaphoneIcon },
      { key: "ad-groups", label: "Ad groups", icon: RectangleGroupIcon },
      { key: "audiences", label: "Audiences", icon: UsersIcon },
      { key: "creatives", label: "Creative library", icon: PhotoIcon },
    ],
  },
  {
    group: "Insights",
    items: [
      { key: "analytics", label: "Analytics", icon: ChartBarIcon },
      { key: "audit", label: "Audit log", icon: ShieldCheckIcon },
    ],
  },
  {
    group: "Account",
    items: [{ key: "team", label: "Team", icon: UserGroupIcon }],
  },
];

export function AdvertiserDashboard({
  initial,
  initialAnalytics,
}: {
  initial: DashboardData;
  initialAnalytics: AdvertiserAnalytics;
}) {
  const [data, setData] = useState(initial);
  const [analytics, setAnalytics] = useState(initialAnalytics);
  const [tab, setTab] = useState<Tab>("overview");
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [editing, setEditing] = useState<
    AdvertiserCampaign | null | undefined
  >();
  const [preview, setPreview] = useState<AdvertiserCampaign | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const role = data.account.role;
  const isManager = [
    "advertiser_owner",
    "advertiser_admin",
    "advertiser_campaign_manager",
  ].includes(role);
  const canManageTeam = ["advertiser_owner", "advertiser_admin"].includes(role);
  const canFund = canManageTeam || role === "advertiser_billing_manager";
  const totals = useMemo(
    () =>
      data.campaigns.reduce(
        (a, c) => ({
          served: a.served + Number(c.served),
          clicked: a.clicked + Number(c.clicked),
          allocated: a.allocated + Number(c.allocatedMinor),
          spent: a.spent + Number(c.spentMinor),
        }),
        { served: 0, clicked: 0, allocated: 0, spent: 0 },
      ),
    [data.campaigns],
  );
  async function refresh() {
    const response = await fetch(
      `/api/advertiser?advertiserId=${encodeURIComponent(data.account.advertiserId)}`,
      { cache: "no-store" },
    );
    if (!response.ok) throw new Error("Ads Manager could not be refreshed.");
    setData(await response.json());
  }
  async function action(campaignId: string, actionName: string) {
    setMessage(null);
    try {
      await mutate({
        operation: "campaign-action",
        advertiserId: data.account.advertiserId,
        campaignId,
        action: actionName,
      });
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed");
    }
  }
  async function bulk(actionName: "pause" | "resume" | "duplicate") {
    if (!checked.length) return;
    setMessage(null);
    try {
      await mutate({
        operation: "bulk-action",
        advertiserId: data.account.advertiserId,
        idempotencyKey: crypto.randomUUID(),
        entityType: "campaign",
        action: actionName,
        entityIds: checked,
      });
      setChecked([]);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Bulk action failed");
    }
  }
  async function fund(campaign: AdvertiserCampaign) {
    const needed = Math.max(
      Number(campaign.budgetMinor) -
        Number(campaign.allocatedMinor) -
        Number(data.credit.availableMinor),
      0,
    );
    if (!needed) return;
    try {
      const result = await mutate({
        operation: "create-funding-checkout",
        advertiserId: data.account.advertiserId,
        campaignId: campaign.id,
        amountMinor: needed,
      });
      window.location.assign(result.checkoutUrl);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Funding checkout could not be opened",
      );
    }
  }
  function chooseTab(value: Tab) {
    setTab(value);
    setDrawer(false);
  }
  return (
    <div className={`advertiser-shell ${collapsed ? "is-collapsed" : ""}`}>
      <button
        className="advertiser-mobile-menu"
        aria-label={drawer ? "Close Ads Manager menu" : "Open Ads Manager menu"}
        aria-expanded={drawer}
        onClick={() => setDrawer((value) => !value)}
      >
        {drawer ? <XMarkIcon /> : <Bars3Icon />}
      </button>
      <aside
        className={`advertiser-sidebar ${drawer ? "is-open" : ""}`}
        aria-label="Ads Manager navigation"
      >
        <div className="advertiser-sidebar-heading">
          <Squares2X2Icon />
          <span>
            <strong>Ads Manager</strong>
            <small>{data.account.displayName}</small>
          </span>
          <button
            className="txk-icon-button advertiser-collapse"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed((value) => !value)}
          >
            <Bars3Icon />
          </button>
        </div>
        <div className="advertiser-sidebar-links">
          {nav.map((group) => (
            <div className="advertiser-nav-group" key={group.group}>
              <span className="advertiser-nav-label">{group.group}</span>
              {group.items.map((item) => {
                const ItemIcon = item.icon;
                return (
                  <button
                    key={item.key}
                    className={`advertiser-sidebar-link ${tab === item.key ? "active" : ""}`}
                    aria-current={tab === item.key ? "page" : undefined}
                    onClick={() => chooseTab(item.key)}
                    title={collapsed ? item.label : undefined}
                  >
                    <ItemIcon />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="advertiser-sidebar-footer">
          <span className="advertiser-sidebar-status" />
          <span>
            <strong>{data.account.status.replaceAll("_", " ")}</strong>
            <small>Admin approval gates live delivery</small>
          </span>
        </div>
      </aside>
      <button
        className={`advertiser-sidebar-backdrop ${drawer ? "is-open" : ""}`}
        aria-label="Close Ads Manager navigation"
        onClick={() => setDrawer(false)}
      />
      <main className="advertiser-workspace">
        <header className="advertiser-heading">
          <div>
            <p className="eyebrow">
              {data.enterprise.businessManagers[0]?.name ??
                "Campaign workspace"}
            </p>
            <h1>
              {
                nav
                  .flatMap((group) => group.items)
                  .find((item) => item.key === tab)?.label
              }
            </h1>
            <p className="card-sub">
              Build, fund, review, and measure privacy-safe TXKPRO advertising.
            </p>
          </div>
          <span
            className={`pill advertiser-status status-${data.account.status}`}
          >
            {data.account.status.replaceAll("_", " ")}
          </span>
        </header>
        {message ? (
          <div className="alert" role="alert">
            {message}
          </div>
        ) : null}
        {data.account.status !== "active" ? (
          <div className="callout advertiser-gate">
            <strong>Advertiser access is not active</strong>
            <p>
              {data.account.reviewNotes ||
                "Contact TXKPRO support to restore this advertiser account."}
            </p>
          </div>
        ) : null}
        {tab === "overview" ? <Overview data={data} totals={totals} /> : null}
        {tab === "campaigns" ? (
          <Campaigns
            data={data}
            checked={checked}
            setChecked={setChecked}
            canManage={isManager}
            canFund={canFund}
            onCreate={() => setEditing(null)}
            onEdit={setEditing}
            onPreview={setPreview}
            onAction={action}
            onBulk={bulk}
            onFund={fund}
          />
        ) : null}
        {tab === "ad-groups" ? (
          <AdGroupsPanel
            data={data}
            canManage={isManager}
            onChanged={refresh}
          />
        ) : null}
        {tab === "audiences" ? (
          <AudiencesPanel
            data={data}
            canManage={isManager}
            onChanged={refresh}
          />
        ) : null}
        {tab === "creatives" ? (
          <CreativesPanel
            data={data}
            canManage={isManager || role === "advertiser_creative"}
            onChanged={refresh}
          />
        ) : null}
        {tab === "analytics" ? (
          <AnalyticsPanel
            advertiserId={data.account.advertiserId}
            campaigns={data.campaigns}
            analytics={analytics}
            onChange={setAnalytics}
          />
        ) : null}
        {tab === "team" ? (
          <TeamPanel
            data={data}
            canManage={canManageTeam}
            onChanged={refresh}
          />
        ) : null}
        {tab === "audit" ? <AuditPanel data={data} /> : null}
        {editing !== undefined ? (
          <CampaignWizard
            data={data}
            campaign={editing}
            onClose={() => setEditing(undefined)}
            onSaved={async () => {
              setEditing(undefined);
              await refresh();
              setTab("campaigns");
            }}
          />
        ) : null}
        {preview ? (
          <CreativePreview
            campaign={preview}
            onClose={() => setPreview(null)}
          />
        ) : null}
      </main>
    </div>
  );
}

function Overview({
  data,
  totals,
}: {
  data: DashboardData;
  totals: { served: number; clicked: number; allocated: number; spent: number };
}) {
  return (
    <>
      <section className="txk-metric-grid">
        <article className="txk-metric-card">
          <span>Available credit</span>
          <strong>
            {money(data.credit.availableMinor, data.credit.currency)}
          </strong>
          <small>Reusable for campaign budgets</small>
        </article>
        <article className="txk-metric-card">
          <span>Allocated</span>
          <strong>{money(totals.allocated)}</strong>
          <small>Reserved for campaigns</small>
        </article>
        <article className="txk-metric-card">
          <span>Actual spend</span>
          <strong>{money(totals.spent)}</strong>
          <small>Reconciled delivery spend</small>
        </article>
        <article className="txk-metric-card">
          <span>Clicks</span>
          <strong>{totals.clicked}</strong>
          <small>{totals.served} impressions</small>
        </article>
      </section>
      <section className="txk-card advertiser-next">
        <h2>Campaign readiness</h2>
        <ol>
          <li>
            Create or reuse an audience, ad group, and creative variation.
          </li>
          <li>Fund the full campaign budget.</li>
          <li>Submit for platform Admin review before delivery.</li>
        </ol>
      </section>
    </>
  );
}

function Campaigns({
  data,
  checked,
  setChecked,
  canManage,
  canFund,
  onCreate,
  onEdit,
  onPreview,
  onAction,
  onBulk,
  onFund,
}: {
  data: DashboardData;
  checked: string[];
  setChecked: (v: string[]) => void;
  canManage: boolean;
  canFund: boolean;
  onCreate: () => void;
  onEdit: (c: AdvertiserCampaign) => void;
  onPreview: (c: AdvertiserCampaign) => void;
  onAction: (id: string, a: string) => void;
  onBulk: (a: "pause" | "resume" | "duplicate") => void;
  onFund: (c: AdvertiserCampaign) => void;
}) {
  return (
    <section>
      <div className="advertiser-section-title">
        <div>
          <h2>Campaigns</h2>
          <p className="card-sub">
            Campaign → ad group → creative. Drafts remain editable until
            submitted.
          </p>
        </div>
        {canManage && data.account.status === "active" ? (
          <button className="txk-button txk-button-primary" onClick={onCreate}>
            <PlusIcon />
            Create campaign
          </button>
        ) : null}
      </div>
      {canManage && checked.length ? (
        <div className="campaign-actions">
          <strong>{checked.length} selected</strong>
          <button
            className="txk-button txk-button-sm"
            onClick={() => onBulk("pause")}
          >
            Pause
          </button>
          <button
            className="txk-button txk-button-sm"
            onClick={() => onBulk("resume")}
          >
            Resume
          </button>
          <button
            className="txk-button txk-button-sm"
            onClick={() => onBulk("duplicate")}
          >
            Duplicate
          </button>
        </div>
      ) : null}
      <div className="advertiser-campaign-grid">
        {data.campaigns.map((c) => {
          const required = Math.max(c.budgetMinor - c.allocatedMinor, 0);
          const canReserve = data.credit.availableMinor >= required;
          const editable = ["draft", "rejected"].includes(c.status);
          return (
            <article className="txk-card campaign-card" key={c.id}>
              <div className="campaign-card-top">
                <label>
                  <input
                    type="checkbox"
                    checked={checked.includes(c.id)}
                    onChange={(event) =>
                      setChecked(
                        event.target.checked
                          ? [...checked, c.id]
                          : checked.filter((id) => id !== c.id),
                      )
                    }
                  />{" "}
                  <span className="pill">{c.status.replaceAll("_", " ")}</span>
                </label>
                <strong>{money(c.budgetMinor, c.currency)}</strong>
              </div>
              <h3>{c.name}</h3>
              <p>
                {new Date(c.startsAt).toLocaleDateString()} –{" "}
                {new Date(c.endsAt).toLocaleDateString()}
              </p>
              <div className="campaign-stats">
                <span>
                  <strong>{c.served}</strong> impressions
                </span>
                <span>
                  <strong>{c.clicked}</strong> clicks
                </span>
                <span>
                  <strong>{money(c.allocatedMinor)}</strong> allocated
                </span>
              </div>
              {c.review?.notes ? (
                <p className="campaign-feedback">
                  <strong>Review feedback:</strong> {c.review.notes}
                </p>
              ) : null}
              <div className="campaign-actions">
                {editable && canManage ? (
                  <button
                    className="txk-button txk-button-primary txk-button-sm"
                    onClick={() => onEdit(c)}
                  >
                    Edit draft
                  </button>
                ) : null}
                <button
                  className="txk-button txk-button-sm"
                  onClick={() => onPreview(c)}
                >
                  Preview
                </button>
                {canFund && editable && c.creatives.length && !canReserve ? (
                  <button
                    className="txk-button txk-button-sm"
                    onClick={() => onFund(c)}
                  >
                    Fund {money(required - data.credit.availableMinor)}
                  </button>
                ) : null}
                {canManage && editable && c.creatives.length && canReserve ? (
                  <button
                    className="txk-button txk-button-sm"
                    onClick={() => onAction(c.id, "submit")}
                  >
                    Submit for review
                  </button>
                ) : null}
                {canManage && ["active", "scheduled"].includes(c.status) ? (
                  <button
                    className="txk-button txk-button-sm"
                    onClick={() => onAction(c.id, "pause")}
                  >
                    Pause
                  </button>
                ) : null}
                {canManage && c.status === "paused" ? (
                  <button
                    className="txk-button txk-button-sm"
                    onClick={() => onAction(c.id, "resume")}
                  >
                    Resume
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
        {!data.campaigns.length ? (
          <div className="txk-card advertiser-empty">
            <h3>No campaigns yet</h3>
            <p>Create your first campaign draft.</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function AdGroupsPanel({
  data,
  canManage,
  onChanged,
}: {
  data: DashboardData;
  canManage: boolean;
  onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const audience = data.manager.audiences.find(
      (item) => item.id === form.get("audienceId"),
    );
    try {
      const group = await mutate({
        operation: "save-ad-group",
        advertiserId: data.account.advertiserId,
        campaignId: form.get("campaignId"),
        name: form.get("name"),
        buyingModel: form.get("buyingModel"),
        bidMinor: Math.round(Number(form.get("bid")) * 100),
        pacingMode: form.get("pacingMode"),
        frequencyCap: Number(form.get("frequencyCap")),
        roleFamily: audience?.roleFamily,
        topic: audience?.topic,
        broadGeography: audience?.broadGeography,
        timezone: "UTC",
        dayparting: [],
        placements: form.getAll("placements"),
      });
      if (audience)
        await mutate({
          operation: "set-ad-group-audience",
          advertiserId: data.account.advertiserId,
          adGroupId: group.adGroupId,
          audienceId: audience.id,
        });
      setOpen(false);
      await onChanged();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Ad group could not be saved",
      );
    }
  }
  return (
    <section>
      <div className="advertiser-section-title">
        <div>
          <h2>Ad groups</h2>
          <p className="card-sub">
            Manage targeting, buying model, pacing, frequency, and placements
            independently.
          </p>
        </div>
        {canManage ? (
          <button
            className="txk-button txk-button-primary"
            onClick={() => setOpen((value) => !value)}
          >
            <PlusIcon />
            New ad group
          </button>
        ) : null}
      </div>
      {open ? (
        <form
          className="txk-card form-stack advertiser-manager-form"
          onSubmit={submit}
        >
          <div className="grid-2">
            <label>
              <span>Campaign</span>
              <select className="input" name="campaignId" required>
                {data.campaigns
                  .filter((c) => ["draft", "rejected"].includes(c.status))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              <span>Ad group name</span>
              <input className="input" name="name" minLength={2} required />
            </label>
            <label>
              <span>Saved audience</span>
              <select className="input" name="audienceId">
                <option value="">No saved audience</option>
                {data.manager.audiences.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Buying model</span>
              <select className="input" name="buyingModel">
                <option value="fixed_cpm">Fixed CPM</option>
                <option value="fixed_cpc">Fixed CPC</option>
              </select>
            </label>
            <label>
              <span>Bid (USD)</span>
              <input
                className="input"
                name="bid"
                type="number"
                min="0"
                step="0.01"
                required
              />
            </label>
            <label>
              <span>Daily frequency cap</span>
              <input
                className="input"
                name="frequencyCap"
                type="number"
                min="1"
                max="20"
                defaultValue="3"
                required
              />
            </label>
            <label>
              <span>Pacing</span>
              <select className="input" name="pacingMode">
                <option value="even">Even</option>
                <option value="accelerated">Accelerated</option>
              </select>
            </label>
          </div>
          <fieldset className="placement-options">
            <legend>Placements</legend>
            {placements.map((p) => (
              <label key={p}>
                <input
                  type="checkbox"
                  name="placements"
                  value={p}
                  defaultChecked={p === "in_feed"}
                />
                {placementLabels[p]}
              </label>
            ))}
          </fieldset>
          {error ? <div className="alert">{error}</div> : null}
          <div className="campaign-actions">
            <button className="txk-button txk-button-primary">
              Save ad group
            </button>
            <button
              type="button"
              className="txk-button"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
      <div className="advertiser-library-grid">
        {data.enterprise.adGroups.map((group) => (
          <article className="txk-card" key={group.id}>
            <span className="pill">{group.status}</span>
            <h3>{group.name}</h3>
            <p>{data.campaigns.find((c) => c.id === group.campaignId)?.name}</p>
            <small>
              {group.buyingModel.toUpperCase()} · {money(group.bidMinor)} ·{" "}
              {group.pacingMode} pacing
            </small>
            <p className="card-sub">
              {group.placements.map((p) => placementLabels[p]).join(" · ")}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function AudienceFields({
  value,
  onChange,
}: {
  value: AudienceDraft;
  onChange: (value: AudienceDraft) => void;
}) {
  const [query, setQuery] = useState(value.neighborhood);
  const [results, setResults] = useState<
    Array<{ id: string; label: string; longitude: number; latitude: number }>
  >([]);
  const [searching, setSearching] = useState(false);
  async function search() {
    setSearching(true);
    try {
      const response = await fetch(
        `/api/advertiser/mapbox/search?advertiserId=${encodeURIComponent(value.advertiserId)}&q=${encodeURIComponent(query)}`,
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setResults(result.results);
    } catch (error) {
      onChange({
        ...value,
        mapError:
          error instanceof Error ? error.message : "Map search unavailable",
      });
    } finally {
      setSearching(false);
    }
  }
  return (
    <div className="form-stack">
      <div className="grid-2">
        <label>
          <span>Audience name</span>
          <input
            className="input"
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
            required
          />
        </label>
        <label>
          <span>Role family</span>
          <select
            className="input"
            value={value.roleFamily}
            onChange={(e) => onChange({ ...value, roleFamily: e.target.value })}
          >
            <option value="">All members</option>
            <option value="student">Students</option>
            <option value="institution">Institutions</option>
            <option value="employer">Employers</option>
            <option value="member">Members</option>
          </select>
        </label>
        <label>
          <span>Trade or topic</span>
          <input
            className="input"
            value={value.topic}
            onChange={(e) => onChange({ ...value, topic: e.target.value })}
            placeholder="e.g. Electrical"
          />
        </label>
        <label>
          <span>Broad geography</span>
          <input
            className="input"
            value={value.broadGeography}
            onChange={(e) =>
              onChange({ ...value, broadGeography: e.target.value })
            }
            placeholder="e.g. Texarkana region"
          />
        </label>
      </div>
      <div className="mapbox-search">
        <label>
          <span>Neighborhood</span>
          <input
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a neighborhood"
          />
        </label>
        <button
          type="button"
          className="txk-button"
          onClick={search}
          disabled={searching}
        >
          {searching ? "Searching…" : "Search map"}
        </button>
      </div>
      {results.length ? (
        <div
          className="mapbox-results"
          role="listbox"
          aria-label="Neighborhood results"
        >
          {results.map((result) => (
            <button
              type="button"
              role="option"
              aria-selected={value.mapboxPlaceId === result.id}
              key={result.id}
              onClick={() => {
                onChange({
                  ...value,
                  mapboxPlaceId: result.id,
                  neighborhood: result.label,
                  longitude: result.longitude,
                  latitude: result.latitude,
                  mapError: "",
                });
                setQuery(result.label);
                setResults([]);
              }}
            >
              {result.label}
            </button>
          ))}
        </div>
      ) : null}
      {value.mapError ? (
        <div className="alert" role="status">
          {value.mapError}
        </div>
      ) : null}
      {value.longitude !== null && value.latitude !== null ? (
        <>
          <label>
            <span>Radius: {(value.radiusM / 1609.344).toFixed(1)} miles</span>
            <input
              type="range"
              min="500"
              max="50000"
              step="500"
              value={value.radiusM}
              onChange={(e) =>
                onChange({ ...value, radiusM: Number(e.target.value) })
              }
            />
          </label>
          <Image
            className="mapbox-preview"
            src={`/api/advertiser/mapbox/static?advertiserId=${encodeURIComponent(value.advertiserId)}&longitude=${value.longitude}&latitude=${value.latitude}&radiusM=${value.radiusM}`}
            alt={`Map of ${value.neighborhood} with selected radius`}
            width={960}
            height={520}
            unoptimized
          />
        </>
      ) : null}
      <p className="card-sub">
        Targeting uses contextual attributes and a neighborhood radius. CRM,
        behavioral retargeting, and lookalikes remain disabled.
      </p>
    </div>
  );
}
type AudienceDraft = {
  advertiserId: string;
  id?: string;
  name: string;
  roleFamily: string;
  topic: string;
  broadGeography: string;
  mapboxPlaceId: string;
  neighborhood: string;
  longitude: number | null;
  latitude: number | null;
  radiusM: number;
  mapError: string;
};
const audienceDraft = (
  advertiserId: string,
  a?: SavedAudience,
): AudienceDraft => ({
  advertiserId,
  id: a?.id,
  name: a?.name ?? "",
  roleFamily: a?.roleFamily ?? "",
  topic: a?.topic ?? "",
  broadGeography: a?.broadGeography ?? "",
  mapboxPlaceId: a?.mapboxPlaceId ?? "",
  neighborhood: a?.neighborhood ?? "",
  longitude: a?.longitude ?? null,
  latitude: a?.latitude ?? null,
  radiusM: a?.radiusM ?? 5000,
  mapError: "",
});
async function saveAudience(value: AudienceDraft) {
  return mutate({
    operation: "save-audience",
    advertiserId: value.advertiserId,
    audienceId: value.id,
    name: value.name,
    roleFamily: value.roleFamily,
    topic: value.topic,
    broadGeography: value.broadGeography,
    mapboxPlaceId: value.mapboxPlaceId,
    neighborhood: value.neighborhood,
    longitude: value.longitude,
    latitude: value.latitude,
    radiusM: value.longitude === null ? null : value.radiusM,
  });
}

function AudiencesPanel({
  data,
  canManage,
  onChanged,
}: {
  data: DashboardData;
  canManage: boolean;
  onChanged: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<AudienceDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    try {
      await saveAudience(draft);
      setDraft(null);
      await onChanged();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Audience could not be saved",
      );
    }
  }
  return (
    <section>
      <div className="advertiser-section-title">
        <div>
          <h2>Audiences</h2>
          <p className="card-sub">
            Reusable contextual, trade, broad-geography, and neighborhood-radius
            audiences.
          </p>
        </div>
        {canManage ? (
          <button
            className="txk-button txk-button-primary"
            onClick={() => setDraft(audienceDraft(data.account.advertiserId))}
          >
            <PlusIcon />
            New audience
          </button>
        ) : null}
      </div>
      {draft ? (
        <form className="txk-card advertiser-manager-form" onSubmit={submit}>
          <AudienceFields value={draft} onChange={setDraft} />
          {error ? <div className="alert">{error}</div> : null}
          <div className="campaign-actions">
            <button className="txk-button txk-button-primary">
              Save audience
            </button>
            <button
              type="button"
              className="txk-button"
              onClick={() => setDraft(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
      <div className="advertiser-library-grid">
        {data.manager.audiences.map((a) => (
          <article className="txk-card" key={a.id}>
            <span className="pill">{a.status}</span>
            <h3>{a.name}</h3>
            <p>
              {[a.roleFamily, a.topic, a.broadGeography]
                .filter(Boolean)
                .join(" · ") || "All contextual members"}
            </p>
            {a.neighborhood ? (
              <small>
                {a.neighborhood} · {((a.radiusM ?? 0) / 1609.344).toFixed(1)} mi
                radius
              </small>
            ) : null}
            {canManage ? (
              <button
                className="txk-button txk-button-sm"
                onClick={() =>
                  setDraft(audienceDraft(data.account.advertiserId, a))
                }
              >
                Edit
              </button>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

type VariationDraft = {
  id?: string;
  name: string;
  assetId: string;
  headline: string;
  body: string;
  destinationUrl: string;
  ctaLabel: string;
};
const emptyVariation = (): VariationDraft => ({
  name: "Variation A",
  assetId: "",
  headline: "",
  body: "",
  destinationUrl: "",
  ctaLabel: "Learn more",
});
function CreativeMedia({ asset }: { asset?: AdAsset }) {
  if (!asset)
    return <div className="creative-placeholder">No media selected</div>;
  return asset.mediaType === "video" ? (
    <video controls preload="metadata" src={asset.url} />
  ) : (
    <Image
      src={asset.url}
      alt={asset.altText ?? "Creative media"}
      width={1200}
      height={630}
      unoptimized
    />
  );
}
function PlacementPreviews({
  variation,
  asset,
}: {
  variation: VariationDraft;
  asset?: AdAsset;
}) {
  return (
    <div className="placement-preview-grid">
      {placements.map((p) => (
        <article className={`creative-preview-card placement-${p}`} key={p}>
          <small>{placementLabels[p]} preview</small>
          <CreativeMedia asset={asset} />
          <span>Sponsored · TXKPRO direct</span>
          <h3>{variation.headline || "Your headline"}</h3>
          <p>{variation.body || "Your message"}</p>
          <span className="txk-button txk-button-primary">
            {variation.ctaLabel || "Learn more"}
          </span>
        </article>
      ))}
    </div>
  );
}
function CreativesPanel({
  data,
  canManage,
  onChanged,
}: {
  data: DashboardData;
  canManage: boolean;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<CreativeSet | null | undefined>();
  const [name, setName] = useState("");
  const [variations, setVariations] = useState<VariationDraft[]>([
    emptyVariation(),
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  function open(set: CreativeSet | null) {
    setEditing(set);
    setName(set?.name ?? "");
    setVariations(
      set?.variations.map((v) => ({ ...v, assetId: v.assetId ?? "" })) ?? [
        emptyVariation(),
      ],
    );
  }
  async function upload(index: number, file: File) {
    setBusy(true);
    setError(null);
    try {
      const prepared = await fetch("/api/advertiser/assets/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          advertiserId: data.account.advertiserId,
          mimeType: file.type,
          byteSize: file.size,
        }),
      });
      const signed = await prepared.json();
      if (!prepared.ok) throw new Error(signed.error);
      const storage = createBrowserSupabaseClient().storage.from("ad-assets");
      const uploaded = await storage.uploadToSignedUrl(
        signed.path,
        signed.token,
        file,
        { contentType: file.type },
      );
      if (uploaded.error) throw uploaded.error;
      const registered = await mutate({
        operation: "register-asset",
        advertiserId: data.account.advertiserId,
        name: file.name,
        mediaType: signed.mediaType,
        storagePath: signed.path,
        mimeType: file.type,
        byteSize: file.size,
        altText: file.name,
      });
      await onChanged();
      setVariations((current) =>
        current.map((v, i) =>
          i === index ? { ...v, assetId: registered.assetId } : v,
        ),
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Asset upload failed",
      );
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setError(null);
    try {
      await mutate({
        operation: "save-creative-set",
        advertiserId: data.account.advertiserId,
        creativeSetId: editing?.id,
        name,
        variations,
      });
      setEditing(undefined);
      await onChanged();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Creative set could not be saved",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <div className="advertiser-section-title">
        <div>
          <h2>Creative library</h2>
          <p className="card-sub">
            Upload private photo/video assets, build variations, and preview
            every placement.
          </p>
        </div>
        {canManage ? (
          <button
            className="txk-button txk-button-primary"
            onClick={() => open(null)}
          >
            <PlusIcon />
            New creative set
          </button>
        ) : null}
      </div>
      {editing !== undefined ? (
        <div className="txk-card advertiser-manager-form">
          <label>
            <span>Creative set name</span>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          {variations.map((variation, index) => {
            const asset = data.manager.assets.find(
              (item) => item.id === variation.assetId,
            );
            return (
              <section className="creative-variation-editor" key={index}>
                <div className="advertiser-section-title">
                  <h3>Variation {index + 1}</h3>
                  {variations.length > 1 ? (
                    <button
                      className="txk-button txk-button-sm"
                      onClick={() =>
                        setVariations((current) =>
                          current.filter((_, i) => i !== index),
                        )
                      }
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
                <div className="grid-2">
                  <label>
                    <span>Variation name</span>
                    <input
                      className="input"
                      value={variation.name}
                      onChange={(e) =>
                        setVariations((current) =>
                          current.map((v, i) =>
                            i === index ? { ...v, name: e.target.value } : v,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    <span>Saved asset</span>
                    <select
                      className="input"
                      value={variation.assetId}
                      onChange={(e) =>
                        setVariations((current) =>
                          current.map((v, i) =>
                            i === index ? { ...v, assetId: e.target.value } : v,
                          ),
                        )
                      }
                    >
                      <option value="">No media</option>
                      {data.manager.assets.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.mediaType})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Upload photo or video</span>
                    <input
                      className="input"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
                      disabled={busy}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void upload(index, file);
                      }}
                    />
                  </label>
                  <label>
                    <span>Headline ({variation.headline.length}/120)</span>
                    <input
                      className="input"
                      maxLength={120}
                      value={variation.headline}
                      onChange={(e) =>
                        setVariations((current) =>
                          current.map((v, i) =>
                            i === index
                              ? { ...v, headline: e.target.value }
                              : v,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    <span>Message ({variation.body.length}/500)</span>
                    <textarea
                      className="input"
                      maxLength={500}
                      value={variation.body}
                      onChange={(e) =>
                        setVariations((current) =>
                          current.map((v, i) =>
                            i === index ? { ...v, body: e.target.value } : v,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    <span>Destination URL</span>
                    <input
                      className="input"
                      type="url"
                      value={variation.destinationUrl}
                      onChange={(e) =>
                        setVariations((current) =>
                          current.map((v, i) =>
                            i === index
                              ? { ...v, destinationUrl: e.target.value }
                              : v,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    <span>Call to action ({variation.ctaLabel.length}/40)</span>
                    <input
                      className="input"
                      maxLength={40}
                      value={variation.ctaLabel}
                      onChange={(e) =>
                        setVariations((current) =>
                          current.map((v, i) =>
                            i === index
                              ? { ...v, ctaLabel: e.target.value }
                              : v,
                          ),
                        )
                      }
                    />
                  </label>
                </div>
                <PlacementPreviews variation={variation} asset={asset} />
              </section>
            );
          })}
          <button
            className="txk-button"
            onClick={() =>
              setVariations((current) => [
                ...current,
                {
                  ...emptyVariation(),
                  name: `Variation ${String.fromCharCode(65 + current.length)}`,
                },
              ])
            }
          >
            <PlusIcon />
            Add variation
          </button>
          {error ? <div className="alert">{error}</div> : null}
          <div className="campaign-actions">
            <button
              className="txk-button txk-button-primary"
              disabled={
                busy ||
                name.trim().length < 2 ||
                variations.some(
                  (v) =>
                    v.headline.trim().length < 2 ||
                    v.body.trim().length < 2 ||
                    !v.destinationUrl.startsWith("https://"),
                )
              }
              onClick={save}
            >
              {busy ? "Saving…" : "Save creative set"}
            </button>
            <button
              className="txk-button"
              onClick={() => setEditing(undefined)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      <div className="advertiser-library-grid">
        {data.manager.creativeSets.map((set) => (
          <article className="txk-card" key={set.id}>
            <span className="pill">{set.status}</span>
            <h3>{set.name}</h3>
            <p>
              {set.variations.length} variation
              {set.variations.length === 1 ? "" : "s"}
            </p>
            {canManage ? (
              <button
                className="txk-button txk-button-sm"
                onClick={() => open(set)}
              >
                Edit & preview
              </button>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

const objectives = [
  {
    id: "brand_awareness",
    title: "Brand awareness",
    description: "Maximize qualified visibility across approved placements.",
    icon: MegaphoneIcon,
    tip: "Best for reach and recall.",
  },
  {
    id: "traffic",
    title: "Traffic",
    description: "Send relevant members to a destination you control.",
    icon: CursorArrowRaysIcon,
    tip: "Optimizes for site visits.",
  },
  {
    id: "engagement",
    title: "Engagement",
    description: "Encourage meaningful interaction with your message.",
    icon: ChatBubbleLeftRightIcon,
    tip: "Best for conversations and interest.",
  },
  {
    id: "leads",
    title: "Leads",
    description: "Generate inquiries from members who show intent.",
    icon: UserPlusIcon,
    tip: "Use a clear conversion destination.",
  },
  {
    id: "conversions",
    title: "Conversions",
    description: "Drive a defined action on your website.",
    icon: ArrowTrendingUpIcon,
    tip: "Use when conversion measurement is ready.",
  },
];
// Editing an attached audience creates a separate contextual audience rather than
// mutating a reusable audience shared with other campaigns. Names are unique per advertiser.
function nextCampaignAudienceName(name: string, audiences: SavedAudience[]) {
  const base = `${name.trim().slice(0, 100)} audience`;
  const used = new Set(audiences.map((audience) => audience.name.toLowerCase()));
  for (let number = 1; number <= 10000; number += 1) {
    const suffix = number === 1 ? "" : ` (${number})`;
    const candidate = `${base.slice(0, 120 - suffix.length)}${suffix}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  throw new Error("Too many audiences have the same campaign name");
}

function CampaignWizard({
  data,
  campaign,
  onClose,
  onSaved,
}: {
  data: DashboardData;
  campaign: AdvertiserCampaign | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const meta = campaign
    ? data.manager.campaignDrafts.find((item) => item.id === campaign.id)
    : undefined;
  const existingGroup = campaign
    ? data.enterprise.adGroups.find((group) => group.campaignId === campaign.id)
    : undefined;
  const existingCreative = campaign?.creatives[0];
  const defaultAudience = data.manager.audiences.find(
    (a) => a.id === existingGroup?.audienceId,
  ) ?? data.manager.audiences.find(
    (a) =>
      a.roleFamily === existingGroup?.roleFamily &&
      a.topic === existingGroup?.topic &&
      a.broadGeography === existingGroup?.broadGeography,
  );
  const [start, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localAudience, setLocalAudience] = useState<{ id: string; name: string } | null>(null);
  const [draft, setDraft] = useState({
    name: campaign?.name ?? "",
    objective: meta?.objective ?? "brand_awareness",
    audienceId: defaultAudience?.id ?? "",
    roleFamily: existingGroup?.roleFamily ?? "",
    topic: existingGroup?.topic ?? "",
    broadGeography: existingGroup?.broadGeography ?? "",
    mapboxPlaceId: defaultAudience?.mapboxPlaceId ?? "",
    neighborhood: defaultAudience?.neighborhood ?? "",
    longitude: defaultAudience?.longitude ?? (null as number | null),
    latitude: defaultAudience?.latitude ?? (null as number | null),
    radiusM: defaultAudience?.radiusM ?? 5000,
    creativeSetId: "",
    variationId: "",
    headline: existingCreative?.headline ?? "",
    body: existingCreative?.body ?? "",
    assetId: "",
    destinationUrl: existingCreative?.destinationUrl ?? "",
    ctaLabel: existingCreative?.ctaLabel ?? "Learn more",
    budget: campaign ? String(campaign.budgetMinor / 100) : "",
    dailyCap: meta?.dailySpendCapMinor
      ? String(meta.dailySpendCapMinor / 100)
      : "",
    startsAt: campaign ? dateValue(campaign.startsAt) : "",
    endsAt: campaign ? dateValue(campaign.endsAt) : "",
    buyingModel: (existingGroup?.buyingModel ?? "fixed_cpm") as BuyingModel,
    placements: (existingGroup?.placements ?? ["in_feed"]) as Placement[],
  });
  const update = (patch: Partial<typeof draft>) =>
    setDraft((current) => ({ ...current, ...patch }));
  const selectedAsset = data.manager.assets.find(
    (asset) => asset.id === draft.assetId,
  );
  const days =
    draft.startsAt && draft.endsAt
      ? Math.max(
          1,
          Math.ceil(
            (new Date(draft.endsAt).valueOf() -
              new Date(draft.startsAt).valueOf()) /
              86400000,
          ) + 1,
        )
      : 0;
  const budgetMinor = Math.round(Number(draft.budget || 0) * 100);
  const dailyMinor = Math.round(Number(draft.dailyCap || 0) * 100);
  const plannedMinor = Math.min(budgetMinor, dailyMinor * days);
  const relevantRates = data.manager.rateCards.filter(
    (rate) =>
      rate.buyingModel === draft.buyingModel &&
      draft.placements.includes(rate.placement),
  );
  const avgRate = relevantRates.length
    ? relevantRates.reduce((sum, rate) => sum + rate.rateMinor, 0) /
      relevantRates.length
    : 0;
  const avgCtr =
    relevantRates
      .filter((rate) => rate.estimatedCtr)
      .reduce((sum, rate) => sum + Number(rate.estimatedCtr), 0) /
    (relevantRates.filter((rate) => rate.estimatedCtr).length || 1);
  const impressions = avgRate
    ? Math.round(
        draft.buyingModel === "fixed_cpm"
          ? (plannedMinor / avgRate) * 1000
          : plannedMinor / avgRate / (avgCtr || 0.01),
      )
    : 0;
  const estimatedCpm = impressions ? (plannedMinor / impressions) * 1000 : 0;
  const selectedAudience = data.manager.audiences.find(
    (item) => item.id === draft.audienceId,
  );
  const selectedVariation = data.manager.creativeSets
    .flatMap((set) => set.variations)
    .find((v) => v.id === draft.variationId);
  function chooseAudience(id: string) {
    const a = data.manager.audiences.find((item) => item.id === id);
    update({
      audienceId: id,
      roleFamily: a?.roleFamily ?? "",
      topic: a?.topic ?? "",
      broadGeography: a?.broadGeography ?? "",
      mapboxPlaceId: a?.mapboxPlaceId ?? "",
      neighborhood: a?.neighborhood ?? "",
      longitude: a?.longitude ?? null,
      latitude: a?.latitude ?? null,
      radiusM: a?.radiusM ?? 5000,
    });
  }
  function chooseVariation(id: string) {
    const v = data.manager.creativeSets
      .flatMap((set) => set.variations)
      .find((item) => item.id === id);
    update({
      variationId: id,
      headline: v?.headline ?? "",
      body: v?.body ?? "",
      assetId: v?.assetId ?? "",
      destinationUrl: v?.destinationUrl ?? "",
      ctaLabel: v?.ctaLabel ?? "Learn more",
    });
  }
  const ready =
    start === 1
      ? draft.name.trim().length >= 2
      : start === 2
        ? Boolean(draft.objective)
        : start === 3
          ? Boolean(
              draft.roleFamily ||
              draft.topic ||
              draft.broadGeography ||
              draft.neighborhood,
            )
          : start === 4
            ? draft.headline.trim().length >= 2 &&
              draft.body.trim().length >= 2 &&
              draft.destinationUrl.startsWith("https://") &&
              draft.placements.length > 0
            : start === 5
              ? budgetMinor > 0 &&
                dailyMinor > 0 &&
                dailyMinor <= budgetMinor &&
                days > 0
              : true;
  async function save() {
    setBusy(true);
    setError(null);
    try {
      let audienceId = draft.audienceId;
      if (!audienceId) {
        const name = nextCampaignAudienceName(draft.name, [
          ...data.manager.audiences,
          ...(localAudience ? [{ ...localAudience, type: "contextual" as const, status: "draft", roleFamily: null, topic: null, broadGeography: null, mapboxPlaceId: null, neighborhood: null, longitude: null, latitude: null, radiusM: null }] : []),
        ]);
        const audience = await saveAudience({
          advertiserId: data.account.advertiserId,
          name,
          roleFamily: draft.roleFamily,
          topic: draft.topic,
          broadGeography: draft.broadGeography,
          mapboxPlaceId: draft.mapboxPlaceId,
          neighborhood: draft.neighborhood,
          longitude: draft.longitude,
          latitude: draft.latitude,
          radiusM: draft.radiusM,
          mapError: "",
        });
        audienceId = audience.audienceId;
        setLocalAudience({ id: audienceId, name });
        update({ audienceId }); // Reuse the new row if a later draft-save step fails.
      }
      const savedCampaign = await mutate({
        operation: "save-campaign",
        advertiserId: data.account.advertiserId,
        campaignId: campaign?.id,
        name: draft.name,
        objective: draft.objective,
        budgetMinor,
        startsAt: new Date(`${draft.startsAt}T00:00:00Z`).toISOString(),
        endsAt: new Date(`${draft.endsAt}T23:59:59Z`).toISOString(),
        frequencyCap: meta?.frequencyCap ?? 3,
        placements: draft.placements,
        audience: {
          roleFamily: draft.roleFamily,
          topic: draft.topic,
          broadGeography: draft.broadGeography,
        },
      });
      await mutate({
        operation: "save-campaign-budget",
        advertiserId: data.account.advertiserId,
        campaignId: savedCampaign.campaignId,
        dailySpendCapMinor: dailyMinor,
      });
      const group = await mutate({
        operation: "save-ad-group",
        advertiserId: data.account.advertiserId,
        campaignId: savedCampaign.campaignId,
        adGroupId: existingGroup?.id,
        name: existingGroup?.name ?? "Primary audience",
        buyingModel: draft.buyingModel,
        bidMinor: Math.round(avgRate),
        pacingMode: existingGroup?.pacingMode ?? "even",
        frequencyCap: existingGroup?.frequencyCap ?? 3,
        roleFamily: draft.roleFamily,
        topic: draft.topic,
        broadGeography: draft.broadGeography,
        timezone: "UTC",
        dayparting: existingGroup?.dayparting ?? [],
        placements: draft.placements,
      });
      await mutate({
        operation: "set-ad-group-audience",
        advertiserId: data.account.advertiserId,
        adGroupId: group.adGroupId,
        audienceId,
      });
      const mediaUrl = selectedAsset
        ? new URL(selectedAsset.url, window.location.origin).toString()
        : (existingCreative?.mediaUrl ?? null);
      await mutate({
        operation: "save-creative",
        advertiserId: data.account.advertiserId,
        campaignId: savedCampaign.campaignId,
        adGroupId: group.adGroupId,
        creativeId: existingCreative?.id,
        headline: draft.headline,
        body: draft.body,
        mediaUrl,
        mediaAlt: selectedAsset?.altText ?? existingCreative?.mediaAlt,
        destinationUrl: draft.destinationUrl,
        ctaLabel: draft.ctaLabel,
        placements: draft.placements,
      });
      if (draft.variationId)
        await mutate({
          operation: "attach-variation",
          advertiserId: data.account.advertiserId,
          adGroupId: group.adGroupId,
          variationId: draft.variationId,
        });
      await onSaved();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Campaign could not be saved",
      );
    } finally {
      setBusy(false);
    }
  }
  const titles = [
    "Campaign name",
    "Objective",
    "Audience",
    "Ad creative & preview",
    "Budget & duration",
    "Overview",
  ];
  const audienceValue: AudienceDraft = {
    advertiserId: data.account.advertiserId,
    name: `${draft.name || "Campaign"} audience`,
    roleFamily: draft.roleFamily,
    topic: draft.topic,
    broadGeography: draft.broadGeography,
    mapboxPlaceId: draft.mapboxPlaceId,
    neighborhood: draft.neighborhood,
    longitude: draft.longitude,
    latitude: draft.latitude,
    radiusM: draft.radiusM,
    mapError: "",
  };
  return (
    <div
      className="advertiser-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="campaign-wizard-title"
    >
      <div className="advertiser-modal-card advertiser-wizard-card">
        <div className="advertiser-modal-head">
          <div>
            <p className="eyebrow">Step {start} of 6</p>
            <h2 id="campaign-wizard-title">{titles[start - 1]}</h2>
          </div>
          <button
            className="txk-icon-button"
            aria-label="Close campaign wizard"
            onClick={onClose}
          >
            <XMarkIcon />
          </button>
        </div>
        <div className="wizard-progress">
          <i style={{ width: `${(start / 6) * 100}%` }} />
        </div>
        {start === 1 ? (
          <div className="form-stack">
            <label>
              <span>Campaign name</span>
              <input
                className="input"
                value={draft.name}
                onChange={(e) => update({ name: e.target.value })}
                maxLength={160}
                autoFocus
              />
            </label>
            <p className="card-sub">
              Choose a name your team will recognize. You can edit this draft
              until it is submitted.
            </p>
          </div>
        ) : null}
        {start === 2 ? (
          <div className="objective-grid">
            {objectives.map((objective) => {
              const ObjectiveIcon = objective.icon;
              return (
                <button
                  key={objective.id}
                  className={`objective-card ${draft.objective === objective.id ? "selected" : ""}`}
                  onClick={() => update({ objective: objective.id })}
                  aria-pressed={draft.objective === objective.id}
                  aria-describedby={`objective-${objective.id}`}
                >
                  <ObjectiveIcon />
                  <strong>{objective.title}</strong>
                  <span>{objective.description}</span>
                  <span
                    className="objective-tooltip"
                    id={`objective-${objective.id}`}
                    role="tooltip"
                  >
                    {objective.tip}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
        {start === 3 ? (
          <>
            <label>
              <span>Use a saved audience</span>
              <select
                className="input"
                value={draft.audienceId}
                onChange={(e) => chooseAudience(e.target.value)}
              >
                <option value="">Build a new audience</option>
                {localAudience && !data.manager.audiences.some((a) => a.id === localAudience.id) && (
                  <option value={localAudience.id}>{localAudience.name}</option>
                )}
                {data.manager.audiences.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <AudienceFields
              value={audienceValue}
              onChange={(value) =>
                update({
                  audienceId: "",
                  roleFamily: value.roleFamily,
                  topic: value.topic,
                  broadGeography: value.broadGeography,
                  mapboxPlaceId: value.mapboxPlaceId,
                  neighborhood: value.neighborhood,
                  longitude: value.longitude,
                  latitude: value.latitude,
                  radiusM: value.radiusM,
                })
              }
            />
          </>
        ) : null}
        {start === 4 ? (
          <div className="form-stack">
            <div className="grid-2">
              <label>
                <span>Saved creative set</span>
                <select
                  className="input"
                  value={draft.creativeSetId}
                  onChange={(e) =>
                    update({ creativeSetId: e.target.value, variationId: "" })
                  }
                >
                  <option value="">Build in this campaign</option>
                  {data.manager.creativeSets.map((set) => (
                    <option key={set.id} value={set.id}>
                      {set.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Saved variation</span>
                <select
                  className="input"
                  value={draft.variationId}
                  onChange={(e) => chooseVariation(e.target.value)}
                >
                  <option value="">Choose variation</option>
                  {data.manager.creativeSets
                    .find((set) => set.id === draft.creativeSetId)
                    ?.variations.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                <span>Saved media</span>
                <select
                  className="input"
                  value={draft.assetId}
                  onChange={(e) => update({ assetId: e.target.value })}
                >
                  <option value="">No media</option>
                  {data.manager.assets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Headline ({draft.headline.length}/120)</span>
                <input
                  className="input"
                  maxLength={120}
                  value={draft.headline}
                  onChange={(e) => update({ headline: e.target.value })}
                />
              </label>
              <label>
                <span>Message ({draft.body.length}/500)</span>
                <textarea
                  className="input"
                  maxLength={500}
                  value={draft.body}
                  onChange={(e) => update({ body: e.target.value })}
                />
              </label>
              <label>
                <span>Destination URL</span>
                <input
                  className="input"
                  type="url"
                  value={draft.destinationUrl}
                  onChange={(e) => update({ destinationUrl: e.target.value })}
                />
              </label>
              <label>
                <span>Call to action ({draft.ctaLabel.length}/40)</span>
                <input
                  className="input"
                  maxLength={40}
                  value={draft.ctaLabel}
                  onChange={(e) => update({ ctaLabel: e.target.value })}
                />
              </label>
              <label>
                <span>Buying model</span>
                <select
                  className="input"
                  value={draft.buyingModel}
                  onChange={(e) =>
                    update({ buyingModel: e.target.value as BuyingModel })
                  }
                >
                  <option value="fixed_cpm">Fixed CPM</option>
                  <option value="fixed_cpc">Fixed CPC</option>
                </select>
              </label>
            </div>
            <fieldset className="placement-options">
              <legend>Placements</legend>
              {placements.map((p) => (
                <label key={p}>
                  <input
                    type="checkbox"
                    checked={draft.placements.includes(p)}
                    onChange={(e) =>
                      update({
                        placements: e.target.checked
                          ? [...draft.placements, p]
                          : draft.placements.filter((item) => item !== p),
                      })
                    }
                  />
                  {placementLabels[p]}
                </label>
              ))}
            </fieldset>
            <PlacementPreviews
              variation={{
                name: "Campaign variation",
                assetId: draft.assetId,
                headline: draft.headline,
                body: draft.body,
                destinationUrl: draft.destinationUrl,
                ctaLabel: draft.ctaLabel,
              }}
              asset={selectedAsset}
            />
          </div>
        ) : null}
        {start === 5 ? (
          <div className="form-stack">
            <div className="grid-2">
              <label>
                <span>Total budget (USD)</span>
                <input
                  className="input"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={draft.budget}
                  onChange={(e) => update({ budget: e.target.value })}
                />
              </label>
              <label>
                <span>Daily spend cap (USD)</span>
                <input
                  className="input"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={draft.dailyCap}
                  onChange={(e) => update({ dailyCap: e.target.value })}
                />
              </label>
              <label>
                <span>Start date</span>
                <input
                  className="input"
                  type="date"
                  value={draft.startsAt}
                  onChange={(e) => update({ startsAt: e.target.value })}
                />
              </label>
              <label>
                <span>End date</span>
                <input
                  className="input"
                  type="date"
                  value={draft.endsAt}
                  onChange={(e) => update({ endsAt: e.target.value })}
                />
              </label>
            </div>
            <div className="estimate-grid">
              <article>
                <span>Duration</span>
                <strong>{days || "—"} days</strong>
              </article>
              <article>
                <span>Estimated impressions</span>
                <strong>
                  {avgRate
                    ? impressions.toLocaleString()
                    : "Rate card required"}
                </strong>
              </article>
              <article>
                <span>Estimated CPM</span>
                <strong>
                  {avgRate
                    ? money(Math.round(estimatedCpm))
                    : "Rate card required"}
                </strong>
              </article>
              <article>
                <span>Maximum scheduled spend</span>
                <strong>{money(plannedMinor)}</strong>
              </article>
            </div>
            {!avgRate ? (
              <div className="callout">
                <strong>Estimate unavailable</strong>
                <p>
                  A platform admin must activate a{" "}
                  {draft.buyingModel.toUpperCase()} rate for the selected
                  placements. Your draft can still be saved.
                </p>
              </div>
            ) : null}
            {dailyMinor * days < budgetMinor ? (
              <div className="callout">
                <strong>Daily cap limits delivery</strong>
                <p>
                  The selected cap and dates permit up to {money(plannedMinor)},
                  below the total budget.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
        {start === 6 ? (
          <div className="wizard-overview">
            <section className="txk-card">
              <h3>{draft.name}</h3>
              <dl>
                <div>
                  <dt>Objective</dt>
                  <dd>
                    {objectives.find((o) => o.id === draft.objective)?.title}
                  </dd>
                </div>
                <div>
                  <dt>Audience</dt>
                  <dd>
                    {selectedAudience?.name ??
                      [
                        draft.roleFamily,
                        draft.topic,
                        draft.broadGeography,
                        draft.neighborhood,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                  </dd>
                </div>
                <div>
                  <dt>Creative</dt>
                  <dd>{selectedVariation?.name ?? draft.headline}</dd>
                </div>
                <div>
                  <dt>Budget</dt>
                  <dd>
                    {money(budgetMinor)} total · {money(dailyMinor)} daily
                  </dd>
                </div>
                <div>
                  <dt>Estimate</dt>
                  <dd>
                    {avgRate
                      ? `${impressions.toLocaleString()} impressions at ${money(Math.round(estimatedCpm))} CPM`
                      : "Pending platform rate card"}
                  </dd>
                </div>
              </dl>
              <p className="card-sub">
                Saving creates or updates a draft. Funding and platform Admin
                approval are still required before publishing or live delivery.
              </p>
            </section>
            <PlacementPreviews
              variation={{
                name: "Campaign variation",
                assetId: draft.assetId,
                headline: draft.headline,
                body: draft.body,
                destinationUrl: draft.destinationUrl,
                ctaLabel: draft.ctaLabel,
              }}
              asset={selectedAsset}
            />
          </div>
        ) : null}
        {error ? (
          <div className="alert" role="alert">
            {error}
          </div>
        ) : null}
        <div className="wizard-actions">
          {start > 1 ? (
            <button
              className="txk-button"
              onClick={() => setStep((value) => value - 1)}
            >
              Back
            </button>
          ) : (
            <button className="txk-button" onClick={onClose}>
              Cancel
            </button>
          )}
          <button
            className="txk-button txk-button-primary"
            disabled={busy || !ready}
            onClick={() => (start < 6 ? setStep((value) => value + 1) : save())}
          >
            {busy
              ? "Saving…"
              : start < 6
                ? "Continue"
                : campaign
                  ? "Update draft"
                  : "Save draft"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AuditPanel({ data }: { data: DashboardData }) {
  return (
    <section className="txk-card">
      <div className="advertiser-section-title">
        <div>
          <h2>Audit log</h2>
          <p className="card-sub">
            Append-only campaign, ad group, audience, and creative history.
          </p>
        </div>
      </div>
      <div className="advertiser-team-list">
        {data.enterprise.audit.map((event, index) => (
          <div key={`${event.entityId}-${event.createdAt}-${index}`}>
            <span>
              <strong>{event.action.replaceAll("_", " ")}</strong>
              <small>
                {event.entityType} · {event.entityId}
              </small>
            </span>
            <time dateTime={event.createdAt}>
              {new Date(event.createdAt).toLocaleString()}
            </time>
          </div>
        ))}
      </div>
    </section>
  );
}
