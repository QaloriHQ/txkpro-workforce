"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ActionModal } from "@/components/design-system/action-modal";
import { StudentCommunityComposer } from "@/components/community/student-community-composer";
import {
  CalendarDaysIcon,
  ChartBarSquareIcon,
  ChevronDownIcon,
  DocumentTextIcon,
  GlobeAltIcon,
  PencilSquareIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";

type PostType = "post" | "article" | "event" | "poll";

const formats = [
  { type: "post" as const, label: "Post", icon: PencilSquareIcon },
  { type: "article" as const, label: "Article", icon: DocumentTextIcon },
  { type: "event" as const, label: "Event", icon: CalendarDaysIcon },
  { type: "poll" as const, label: "Poll", icon: ChartBarSquareIcon },
];

export function CommunityCreateMenu({
  viewerName,
  triggerText = "Create",
  studentCompact = false,
}: {
  viewerName: string;
  triggerText?: string;
  studentCompact?: boolean;
}) {
  const router = useRouter();
  const [type, setType] = useState<PostType>("post");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [locationType, setLocationType] = useState<"physical" | "online">("physical");
  const [pollMode, setPollMode] = useState<"single" | "multiple">("single");
  const [options, setOptions] = useState(["", ""]);
  const [legacySelected, setLegacySelected] = useState(false);

  function reset() {
    setType("post");
    setFeedback("");
    setLocationType("physical");
    setPollMode("single");
    setOptions(["", ""]);
    setLegacySelected(false);
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFeedback("");
    const data = new FormData(event.currentTarget);

    try {
      let endpoint = "/api/community/posts";
      let payload: Record<string, unknown>;

      if (type === "event") {
        const starts = new Date(String(data.get("startsAt")));
        const ends = new Date(String(data.get("endsAt")));
        if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime())) throw new Error("Enter valid event dates and times.");
        endpoint = "/api/community/events";
        payload = {
          title: data.get("title"), description: data.get("description"), coverUrl: data.get("coverUrl"),
          startsAt: starts.toISOString(), endsAt: ends.toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          locationType, venueName: data.get("venueName"), address: data.get("address"), onlineUrl: data.get("onlineUrl"), organizerName: viewerName,
        };
      } else if (type === "poll") {
        endpoint = "/api/community/polls";
        payload = {
          question: data.get("question"), selectionMode: pollMode,
          maxSelections: pollMode === "single" ? 1 : Number(data.get("maxSelections")),
          durationHours: Number(data.get("durationHours")), options: options.map((value) => value.trim()).filter(Boolean),
        };
      } else {
        const mediaUrl = String(data.get("media") || "").trim();
        payload = {
          postType: type, title: String(data.get("title") || ""), body: String(data.get("body") || ""),
          topic: String(data.get("topic") || ""), location: String(data.get("location") || ""),
          media: mediaUrl ? [mediaUrl] : [], publicAcknowledged: data.get("publicAcknowledged") === "on",
        };
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : `Your ${type} could not be published.`);

      if (type === "event") {
        router.push(`/events/${body.id}`);
        return;
      }
      if (type === "poll") {
        router.push(`/polls/${body.id}`);
        return;
      }
      setFeedback("Published. Refreshing your Community feed…");
      window.setTimeout(() => window.location.reload(), 350);
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : `Your ${type} could not be published.`);
      setBusy(false);
    }
  }

  const formTitle = type === "post" ? "Create a post" : type === "article" ? "Write an article" : type === "event" ? "Create an event" : "Create a poll";

  if (studentCompact) return <StudentCommunityComposer viewerName={viewerName} triggerText={triggerText} />;

  if (!studentCompact) return <ActionModal
    title="Create in Community"
    triggerLabel="Create Community content"
    triggerContent={<><PlusIcon aria-hidden="true" /><span>Create</span></>}
    busy={busy}
    className="community-create-dialog"
    onClose={reset}
  >
    {!legacySelected ? <div className="community-create-options">
      <button type="button" onClick={() => { setType("post"); setLegacySelected(true); }}><PencilSquareIcon aria-hidden="true" /><span><strong>Post</strong><small>Share an update or question</small></span></button>
      <button type="button" onClick={() => { setType("article"); setLegacySelected(true); }}><DocumentTextIcon aria-hidden="true" /><span><strong>Article</strong><small>Publish a longer insight</small></span></button>
      <Link href="/events"><CalendarDaysIcon aria-hidden="true" /><span><strong>Event</strong><small>Invite the community</small></span></Link>
      <Link href="/polls"><ChartBarSquareIcon aria-hidden="true" /><span><strong>Poll</strong><small>Ask and gather votes</small></span></Link>
    </div> : <form className="community-composer" onSubmit={publish}>
      <button className="text-button" type="button" onClick={() => setLegacySelected(false)}>Choose another format</button>
      <p className="community-author-note"><strong>Posting as {viewerName}</strong><br />Community content is attributed to your individual TXKPRO account.</p>
      <label>{type === "article" ? "Article title" : "Post title"}<input name="title" maxLength={160} required={type === "article"} placeholder="Add a helpful headline" /></label>
      <label>{type === "article" ? "Article" : "Your update"}<textarea name="body" maxLength={8000} required rows={5} placeholder="Ask a question, share progress, or offer advice…" /></label>
      <div className="community-field-row"><label>Topic<input name="topic" maxLength={64} placeholder="e.g. Electrical" /></label><label>Location<input name="location" maxLength={120} placeholder="e.g. Texarkana, TX" /></label></div>
      <label>Image URL<input name="media" type="url" placeholder="https://… (optional)" /></label>
      <label className="community-public-check"><input name="publicAcknowledged" type="checkbox" required /><span><strong>Public</strong> — visible on TXKPRO and search engines.</span></label>
      <div className="community-composer-actions"><span role="status">{feedback}</span><button className="button" disabled={busy}>{busy ? "Publishing…" : `Publish ${type}`}</button></div>
    </form>}
  </ActionModal>;

  return <ActionModal
    title={formTitle}
    triggerLabel={`${triggerText} in Community`}
    triggerContent={<><PlusIcon aria-hidden="true" /><span>{triggerText}</span></>}
    busy={busy}
    className="community-create-dialog"
    onClose={reset}
  >
    <div className="community-format-tabs" role="tablist" aria-label="Choose content type">
      {formats.map(({ type: format, label, icon: Icon }) => <button
        key={format}
        type="button"
        role="tab"
        aria-selected={type === format}
        onClick={() => { setType(format); setFeedback(""); }}
      ><Icon aria-hidden="true" /><span>{label}</span></button>)}
    </div>

    <form className="community-quick-composer" onSubmit={publish}>
      <div className="community-composer-identity">
        <span className="community-avatar" aria-hidden="true">{viewerName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("") || "ME"}</span>
        <div><strong>{viewerName}</strong><span><GlobeAltIcon aria-hidden="true" /> Community audience</span></div>
      </div>

      {type === "post" || type === "article" ? <>
        {type === "article" ? <label className="community-title-field"><span>Article title</span><input name="title" maxLength={160} required placeholder="Give your article a clear headline" autoFocus /></label> : null}
        <label className="community-body-field"><span>{type === "article" ? "Article" : "Post"}</span><textarea name="body" maxLength={8000} required rows={type === "article" ? 7 : 4} placeholder={type === "article" ? "Share what you know…" : "What do you want to share?"} autoFocus={type === "post"} /></label>
        <details className="community-composer-details">
          <summary><PlusIcon aria-hidden="true" /> Add topic, location, or image <ChevronDownIcon aria-hidden="true" /></summary>
          <div className="community-optional-fields">
            <label><span>Topic</span><input name="topic" maxLength={64} placeholder="e.g. Electrical" /></label>
            <label><span>Location</span><input name="location" maxLength={120} placeholder="e.g. Texarkana, TX" /></label>
            <label><span>Image URL</span><input name="media" type="url" placeholder="https://…" /></label>
          </div>
        </details>
        <label className="community-public-check"><input name="publicAcknowledged" type="checkbox" required /><span>Public — visible on TXKPRO and search engines.</span></label>
      </> : null}

      {type === "event" ? <>
        <label className="community-title-field"><span>Event title</span><input name="title" required maxLength={160} placeholder="Name your event" autoFocus /></label>
        <label className="community-body-field"><span>Description</span><textarea name="description" required maxLength={8000} rows={3} placeholder="What should people know?" /></label>
        <div className="community-field-row"><label><span>Starts</span><input name="startsAt" type="datetime-local" required /></label><label><span>Ends</span><input name="endsAt" type="datetime-local" required /></label></div>
        <div className="community-segmented-field" role="group" aria-label="Event location type">
          <button type="button" aria-pressed={locationType === "physical"} onClick={() => setLocationType("physical")}>In person</button>
          <button type="button" aria-pressed={locationType === "online"} onClick={() => setLocationType("online")}>Online</button>
        </div>
        {locationType === "physical" ? <label><span>Address</span><input name="address" required maxLength={500} placeholder="Where is it happening?" /></label> : <label><span>Private event link</span><input name="onlineUrl" type="url" required placeholder="https://…" /><small>Shown only to eligible RSVPs.</small></label>}
        <details className="community-composer-details"><summary><PlusIcon aria-hidden="true" /> Add event details <ChevronDownIcon aria-hidden="true" /></summary><div className="community-optional-fields"><label><span>Venue name</span><input name="venueName" maxLength={160} /></label><label><span>Cover image URL</span><input name="coverUrl" type="url" placeholder="https://…" /></label></div></details>
      </> : null}

      {type === "poll" ? <>
        <label className="community-title-field"><span>Question</span><input name="question" required maxLength={280} placeholder="What do you want to ask?" autoFocus /></label>
        <div className="community-poll-options">
          {options.map((option, index) => <label key={index}><span>Option {index + 1}</span><input value={option} required onChange={(event) => setOptions((current) => current.map((value, item) => item === index ? event.target.value : value))} placeholder="Add an answer" /></label>)}
          <div><button type="button" className="text-button" disabled={options.length >= 10} onClick={() => setOptions((current) => [...current, ""])}>Add option</button>{options.length > 2 ? <button type="button" className="text-button" onClick={() => setOptions((current) => current.slice(0, -1))}>Remove option</button> : null}</div>
        </div>
        <details className="community-composer-details"><summary><PlusIcon aria-hidden="true" /> Voting settings <ChevronDownIcon aria-hidden="true" /></summary><div className="community-optional-fields"><label><span>Voting</span><select value={pollMode} onChange={(event) => setPollMode(event.target.value as "single" | "multiple")}><option value="single">Choose one</option><option value="multiple">Choose multiple</option></select></label>{pollMode === "multiple" ? <label><span>Maximum choices</span><input name="maxSelections" type="number" min={2} max={Math.max(2, options.length)} defaultValue={2} /></label> : null}<label><span>Duration</span><select name="durationHours" defaultValue="72"><option value="24">1 day</option><option value="72">3 days</option><option value="168">7 days</option><option value="720">30 days</option></select></label></div></details>
      </> : null}

      <div className="community-composer-footer">
        <span role={feedback ? "alert" : "status"}>{feedback}</span>
        <button className="txk-button txk-button-primary txk-button-md" disabled={busy}>{busy ? "Publishing…" : `Publish ${type}`}</button>
      </div>
    </form>
  </ActionModal>;
}
