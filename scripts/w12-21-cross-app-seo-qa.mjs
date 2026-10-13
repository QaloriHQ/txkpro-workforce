import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sitemap = readFileSync("app/sitemap.ts", "utf8");
const seo = readFileSync("lib/public/seo.ts", "utf8");
const migration = readFileSync("supabase/staging/migrations/20261013121316_workforce_w12_18_19_21_public_trust.sql", "utf8");
const organization = readFileSync("components/public/organization-page.tsx", "utf8");
const professional = readFileSync("components/professional/public-page.tsx", "utf8");
const student = readFileSync("app/students/[slug]/page.tsx", "utf8");

test("cross-app metadata uses absolute canonical URLs and share previews", () => {
  assert.match(seo, /absolutePublicUrl/);
  assert.match(seo, /alternates: \{ canonical \}/);
  assert.match(seo, /openGraph/);
  assert.match(seo, /twitter/);
  assert.match(seo, /robots:/);
});

test("public page types emit semantic JSON-LD and breadcrumbs", () => {
  assert.match(organization, /EducationalOrganization/);
  assert.match(professional, /"Person"/);
  assert.match(student, /"ProfilePage"/);
  for (const source of [organization, professional, student]) {
    assert.match(source, /aria-label="Breadcrumb"/);
    assert.match(source, /application\/ld\+json/);
  }
});

test("sitemaps include only database-projected public indexable records", () => {
  assert.match(sitemap, /organizationSitemap/);
  assert.match(sitemap, /credentialSitemap/);
  assert.match(migration, /organization_public_sitemap/);
  assert.match(migration, /credential_public_sitemap/);
  assert.match(migration, /publication_status='published' and p\.robots_index/);
});
