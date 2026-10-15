import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const navigation = await read("lib/community/navigation.ts");
const header = await read("components/community/community-header.tsx");
const create = await read("components/community/community-create-menu.tsx");
const studentNav = await read("components/student/workspace-nav.tsx");
const studentHeader = await read("components/student/workspace-header.tsx");
const communityHome = await read("components/community/community-home-page.tsx");
const shellStyles = await read("app/community-shell.css");
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
  assert.match(create, /viewerName/);
  assert.match(create, /community-format-tabs/);
  assert.match(create, /community-composer-details/);
});

test("Student Workspace and Community share one header interaction with separate drawers", () => {
  assert.match(studentHeader, /mode = "workspace"/);
  assert.match(studentHeader, /mode === "community"/);
  assert.match(studentHeader, /triggerText="Post"/);
  assert.match(studentHeader, /studentCompact/);
  assert.match(studentHeader, /aria-expanded={open}/);
  assert.match(studentHeader, /event\.key === "Escape"/);
  assert.match(studentHeader, /Switch to Community/);
  assert.match(studentHeader, /Return to Workspace/);
  assert.match(studentHeader, /SignOutButton/);
});

test("compact composer is Student-only and other role creation stays unchanged", () => {
  assert.match(create, /studentCompact = false/);
  assert.match(create, /if \(!studentCompact\)/);
  assert.match(create, /community-create-options/);
});

test("Student Community includes the mobile bottom navigation", () => {
  assert.match(communityHome, /StudentWorkspaceHeader/);
  assert.match(communityHome, /StudentWorkspaceNav active="home"/);
});

test("Student drawer is rendered on an opaque panel above a dimmed backdrop", () => {
  assert.match(shellStyles, /\.student-profile-drawer[\s\S]*background-color:var\(--txk-bg-panel\)/);
  assert.match(shellStyles, /\.student-profile-drawer[\s\S]*opacity:1/);
  assert.match(shellStyles, /\.student-drawer-backdrop[\s\S]*z-index:90/);
});
