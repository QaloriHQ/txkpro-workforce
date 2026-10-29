import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("app/globals.css", "utf8");
const primitives = readFileSync(
  "components/design-system/primitives.tsx",
  "utf8",
);

test("shared action tokens define the approved primary palette", () => {
  assert.match(css, /--txk-action:\s*#1173d4;/i);
  assert.match(css, /--txk-action-contrast:\s*#ffffff;/i);
  assert.match(css, /--txk-action-hover:\s*#[0-9a-f]{6};/i);
  assert.match(css, /--txk-action-active:\s*#[0-9a-f]{6};/i);
});

test("legacy and design-system primary actions share blue, white and rounded controls", () => {
  assert.match(css, /\.button\s*\{[^}]*min-height:\s*44px[^}]*border-radius:\s*var\(--txk-radius-control\)[^}]*background:\s*var\(--txk-action\)[^}]*color:\s*var\(--txk-action-contrast\)/s);
  assert.match(css, /\.button-dark,\.button-brand\s*\{[^}]*background:\s*var\(--txk-action\)[^}]*color:\s*var\(--txk-action-contrast\)/s);
  assert.match(css, /\.txk-button-primary\s*\{[^}]*background:\s*var\(--txk-action\)[^}]*color:\s*var\(--txk-action-contrast\)/s);
});

test("secondary actions use panel background, blue text and blue border", () => {
  assert.match(css, /\.button\.secondary,\.button-ghost\s*\{[^}]*background:\s*var\(--txk-bg-panel\)[^}]*color:\s*var\(--txk-action\)[^}]*border-color:\s*var\(--txk-action\)/s);
  assert.match(css, /\.txk-button-default,\s*\.txk-button-secondary\s*\{[^}]*background:\s*var\(--txk-bg-panel\)[^}]*color:\s*var\(--txk-action\)[^}]*border-color:\s*var\(--txk-action\)/s);
  assert.match(primitives, /"secondary"/);
});
