import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Execute the production metadata functions, without loading server credentials.
const source = readFileSync(new URL('../app/employers/public-learning-model.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const testModule = { exports: {} };
new Function('exports', 'module', compiled)(testModule.exports, testModule);
const { publicLearningMetadata: metadata, publicLearningStructuredData: structured, serializePublicJsonLd: serialize } = testModule.exports;
const page = { found: true, kind: 'course', title: 'Safe Training', description: 'Published description', canonicalPath: '/employers/acme/courses/safety', robotsIndex: true, employer: { name: 'Acme', canonicalPath: '/employers/acme' } };
test('metadata and structured data use canonical public URLs and publishable facts', () => {
  const m = metadata(page, 'https://example.com');
  assert.equal(m.alternates.canonical, 'https://example.com/employers/acme/courses/safety');
  assert.equal(m.openGraph.url, m.alternates.canonical);
  assert.equal(m.robots.index, true);
  assert.equal(structured(page, 'https://example.com')['@type'], 'Course');
});
test('private or missing pages and redirect aliases never get indexable metadata', () => {
  for (const p of [{ found: false }, { found: true, redirectPath: page.canonicalPath }]) {
    assert.equal(metadata(p, 'https://example.com').robots.index, false);
    assert.equal(structured(p, 'https://example.com'), null);
  }
  assert.equal(metadata({ ...page, robotsIndex: false }, 'https://example.com').robots.index, false);
});
test('lesson structured data has its canonical parent course', () => {
  const d = structured({ ...page, kind: 'lesson', course: { title: 'Course', canonicalPath: page.canonicalPath } }, 'https://example.com');
  assert.equal(d['@type'], 'LearningResource');
  assert.equal(d.isPartOf.url, 'https://example.com' + page.canonicalPath);
});
test('arbitrary fields cannot reach SEO structured data', () => {
  const d = structured({ ...page, answerKey: 'SECRET', email: 'PRIVATE', assignmentId: 'PRIVATE', structured_data_override: { privateNotes: 'SECRET' } }, 'https://example.com');
  assert.doesNotMatch(JSON.stringify(d), /SECRET|PRIVATE|answerKey|privateNotes|assignmentId/);
});
test('authored JSON-LD cannot terminate a script element', () => {
  const text = serialize({ name: '</script><script>alert(1)</script>' });
  assert.ok(!text.includes('<'));
  assert.equal(JSON.parse(text).name, '</script><script>alert(1)</script>');
});
