import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeServerSecret } from "../lib/supabase/server-secret.ts";

test("server key tolerates copied line wrapping without changing key bytes", () => {
  assert.equal(normalizeServerSecret(" sb_secret_abc\nDEF\t"), "sb_secret_abcDEF");
  assert.equal(normalizeServerSecret("aaa.bbb-ccc_ddd"), "aaa.bbb-ccc_ddd");
});

test("invalid configuration errors never echo supplied credentials", () => {
  for (const input of [undefined, " \n ", "not-a-key!private-value"]) {
    assert.throws(
      () => normalizeServerSecret(input),
      (error) => error instanceof Error &&
        error.message === "Supabase server secret configuration is invalid." &&
        !error.message.includes("private-value"),
    );
  }
});
