import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [header, groups, events, polls, messages, safety, gallery, composer, css] = await Promise.all([
  read("components/community/role-aware-community-header.tsx"),
  read("app/groups/page.tsx"),
  read("app/events/page.tsx"),
  read("app/polls/page.tsx"),
  read("app/messages/page.tsx"),
  read("app/community/safety/page.tsx"),
  read("components/community/student-discovery-gallery.tsx"),
  read("components/community/student-community-composer.tsx"),
  read("app/community-shell.css"),
]);

test("target pages use the role-aware Community header", () => {
  for (const source of [groups, events, polls, messages, safety]) assert.match(source, /RoleAwareCommunityHeader/);
  assert.match(header, /account\.role === "student"/);
  assert.match(header, /StudentWorkspaceHeader/);
  assert.match(header, /mode="community"/);
  assert.match(header, /legacyWorkspaceHref \?\? navigation\.workspaceHref/);
});

test("Events and Polls are Student-only galleries while legacy creators remain available", () => {
  assert.match(events, /account\.role === "student"/);
  assert.match(events, /StudentEventGallery/);
  assert.match(events, /EventCreator/);
  assert.match(polls, /account\.role === "student"/);
  assert.match(polls, /StudentPollGallery/);
  assert.match(polls, /PollCreator/);
});

test("gallery supports searchable filters, privacy-safe summaries, and deterministic timezones", () => {
  for (const label of ["Upcoming", "My events", "Going", "Interested", "Past", "Open", "Voted", "My polls", "Closed"]) assert.match(gallery, new RegExp(label));
  assert.match(gallery, /normalizedQuery/);
  assert.match(gallery, /timeZone: event\.timezone/);
  assert.match(gallery, /totalBallots/);
  assert.doesNotMatch(gallery, /voter_user_id|ballot_id/);
});

test("Create buttons open the requested autosaved wizard and drawers are opaque", () => {
  assert.match(events, /initialType="event"/);
  assert.match(polls, /initialType="poll"/);
  assert.match(composer, /initialType="post"/);
  assert.match(css, /\.community-profile-drawer[^}]*background-color:var\(--txk-bg-panel\)[^}]*background-image:none[^}]*opacity:1/s);
  assert.match(css, /\.student-profile-drawer[^}]*background-color:var\(--txk-bg-panel\)[^}]*background-image:none[^}]*opacity:1/s);
  assert.match(css, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /\.student-discovery-grid \{ width:100%; grid-template-columns:1fr/);
});
