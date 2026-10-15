import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const navigation = await read("lib/community/navigation.ts");
const header = await read("components/community/community-header.tsx");
const create = await read("components/community/community-create-menu.tsx");
const studentNav = await read("components/student/workspace-nav.tsx");
const institutionNav = await read("components/institution/workspace-nav.tsx");
const employerNav = await read("components/employer/workspace-nav.tsx");

test("Community Home has canonical role-native routes", () => {
  for (const path of ["/student/community", "/institution/community", "/employer/community"]) assert.match(navigation, new RegExp(path));
});

test("profile drawer contains Community navigation and account controls", () => {
  for (const label of ["Community Home", "Groups", "Events", "Polls", "Messages", "Safety & reports", "My AuthCard", "SignOutButton"]) assert.match(header, new RegExp(label));
  assert.match(header, /aria-expanded={open}/);
  assert.match(header, /event\.key === "Escape"/);
});

test("workspace and Community modes expose explicit toggles", () => {
  assert.match(header, /Return to Workspace/);
  assert.match(studentNav, /\/student\/community/);
  assert.match(institutionNav, /Switch to Community/);
  assert.match(employerNav, /Switch to Community/);
});

test("dedicated creator supports posts, articles, events and polls with individual attribution", () => {
  for (const label of ["Post", "Article", "Event", "Poll"]) assert.match(create, new RegExp(label));
  assert.match(create, /Posting as {viewerName}/);
  assert.match(create, /individual TXKPRO account/);
});
