import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(readFileSync(new URL('../components/professional/profile-view.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
const compiledModule = { exports: {} };
new Function('require', 'module', 'exports', compiled)(require, compiledModule, compiledModule.exports);
const { ProfessionalProfileView } = compiledModule.exports;
const profile = { kind: 'educator', displayName: '</script><script>alert(1)</script>', headline: 'Instructor', bio: '<img src=x onerror=alert(1)>', specialties: 'Welding\nFabrication', credentials: 'Owner-entered <license>', affiliations: [{ name: 'Texarkana College', programs: ['Welding'], verified: true }], posts: [] };
test('SSR escapes user claims, distinguishes membership verification, and excludes editing controls', () => {
 const html = renderToStaticMarkup(React.createElement(ProfessionalProfileView, { profile }));
 assert.ok(html.includes('&lt;script&gt;'));
 assert.ok(html.includes('&lt;img'));
 assert.ok(!html.includes('<script>'));
 assert.ok(!html.includes('onerror=' + '"'));
 assert.ok(html.includes('Membership verified'));
 assert.ok(html.includes('Self-entered claims'));
 assert.ok(html.includes('does not verify a credential or skill'));
 assert.ok(!html.includes('<form'));
 assert.ok(!html.includes('Edit professional'));
});
test('empty optional public projections produce no reviews, ratings, posts or activity section', () => {
 const html = renderToStaticMarkup(React.createElement(ProfessionalProfileView, { profile: { ...profile, reviews: [], rating: null, activity: [] } }));
 for (const title of ['Reviews', 'Posts', 'Activity']) assert.ok(!html.includes(`<h2>${title}</h2>`));
});
