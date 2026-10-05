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
const typesModule = { exports: {} };
const typesCode = ts.transpileModule(readFileSync(new URL('../lib/professional-profile/types.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
new Function('require', 'module', 'exports', typesCode)(require, typesModule, typesModule.exports);
new Function('require', 'module', 'exports', compiled)(name => name === '@/lib/professional-profile/types' ? typesModule.exports : require(name), compiledModule, compiledModule.exports);
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

test('customized SSR includes photo and cover, reorders sections and hides selected content', () => {
 const html = renderToStaticMarkup(React.createElement(ProfessionalProfileView, { profile: { ...profile, customization: { layout: 'compact', panelOrder: ['credentials','about','specialties','reviews','posts','activity'], hiddenSections: ['specialties'], photoUrl: '/api/professional/public-image?slot=photo', coverUrl: '/api/professional/public-image?slot=cover' } } }));
 assert.ok(html.includes('professional-layout-compact'));
 assert.ok(html.includes('slot=photo'));
 assert.ok(html.includes('slot=cover'));
 assert.ok(html.indexOf('<h2>Credentials') < html.indexOf('<h2>About'));
 assert.ok(!html.includes('Self-described specialties'));
});
