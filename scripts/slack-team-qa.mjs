import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Team } from './slack-team/team.mjs';
import { Store } from './slack-team/store.mjs';
import { digest, route, incidentRoute, validateConfig, workingHours } from './slack-team/policy.mjs';
import { adapters } from './slack-team/adapters.mjs';

const config = { repository: 'QaloriHQ/txkpro-workforce', teamId: 'T1', channelId: 'C1', ownerId: 'UOWNER', allowedUserIds: ['UOWNER', 'UCOLLEAGUE'], memberIds: { maya: 'UMAYA', devon: 'UDEVON', riley: 'URILEY' }, monitorAppIds: ['AMONITOR'], enabled: true, legacyListenerStopped: true, monthlyTokens: 1000000, taskTokens: 500000, incidentReserveTokens: 100000, maxOutputTokens: 400, model: 'configured/model', minDelayMs: 0, maxDelayMs: 0 };
const message = (text, extra = {}) => ({ type: 'event_callback', team_id: 'T1', event: { user: 'UOWNER', channel: 'C1', ts: '10.01', text, ...extra } });
const proposal = (extra = {}) => ({ kind: 'proposal', title: 'Improve invitations', body: 'Approved scope and acceptance criteria.', threadTs: '10.01', findings: Object.fromEntries(['requirements','implementation','dependencies','alternatives','risks','acceptance'].map(k => [k, `${k}: researched findings`])), sources: ['https://github.com/QaloriHQ/txkpro-workforce/issues/378'], ...extra });
function fixture(t, overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'txkpro-team-'));
  const store = new Store(dir); const calls = [];
  const io = { post: async (...v) => calls.push(['post', ...v]), context: async () => ({ evidence: 'live' }), evidence: async () => true, generate: async (id, input) => { calls.push(['generate', id, structuredClone(input)]); return { text: 'I recommend reviewing the invitation requirements.', usage: { total_tokens: 10 } }; }, findIssue: async () => null, createIssue: async () => { calls.push(['create']); return 400; }, accept: async (...v) => calls.push(['accept', ...v]), ...overrides };
  let date = new Date('2026-11-02T16:00:00Z');
  const team = new Team(store, structuredClone(config), io, () => date);
  t.after(() => { store.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { team, store, io, calls, dir, setTime: value => { date = new Date(value); } };
}
test('routing addresses one owner; passing keywords and unrelated messages stay quiet', () => {
  assert.equal(route(message('Maya, please review this').event, config).owner, 'maya');
  assert.equal(route(message('<@UDEVON> review this').event, config).owner, 'devon');
  assert.equal(route(message('Engineering, can you inspect this?').event, config).owner, 'devon');
  assert.equal(route(message('The design was discussed yesterday').event, config), null);
  assert.equal(route(message('hello').event, config), null);
  assert.equal(route(message('Maya', { user: 'URILEY' }).event, config), null);
  assert.equal(route(message('Maya', { bot_id: 'B1' }).event, config), null);
  assert.deepEqual(route(message('Everyone, review this').event, config).reviewers, ['devon','riley']);
});
test('Chicago daily hours honor daylight-saving boundaries and 18:00 cutoff', () => {
  for (const iso of ['2026-07-05T13:00:00Z', '2026-11-02T14:00:00Z']) assert.equal(workingHours(new Date(iso)), true);
  for (const iso of ['2026-07-05T12:59:59Z', '2026-11-02T13:59:59Z', '2026-11-03T00:00:00Z']) assert.equal(workingHours(new Date(iso)), false);
});
test('only configured monitoring apps bypass mention rules', () => {
  const e = message('outage', { bot_id: 'B1', app_id: 'AMONITOR' }).event;
  assert.equal(incidentRoute(e, config).urgent, true);
  assert.equal(incidentRoute({ ...e, app_id: 'ASPOOF' }, config), null);
});
test('activation fails closed with missing budget, duplicate IDs or legacy listener', () => {
  validateConfig(config, { activate: true });
  for (const changes of [{ enabled: false }, { monthlyTokens: 0 }, { legacyListenerStopped: false }, { memberIds: { maya: 'UMAYA', devon: 'UMAYA', riley: 'URILEY' } }, { ownerId: '' }]) assert.throws(() => validateConfig({ ...config, ...changes }, { activate: true }));
});
test('cross-workspace/channel/users and message edits cannot enter the queue', t => {
  const { team, store } = fixture(t);
  for (const payload of [{ ...message('Maya'), team_id: 'TWRONG' }, message('Maya', { channel: 'CWRONG' }), message('Maya', { user: 'UWRONG' }), message('Maya', { subtype: 'message_changed' })]) assert.equal(team.ingest(payload), false);
  assert.equal(store.state.jobs.length, 0);
});
test('duplicate Slack deliveries and overlapping tick calls do not duplicate responses', async t => {
  const { team, calls } = fixture(t);
  assert.equal(team.ingest(message('Maya, please review')), true);
  assert.equal(team.ingest(message('Maya, please review')), false);
  await Promise.all([team.tick(), team.tick()]);
  assert.equal(calls.filter(c => c[0] === 'post').length, 1);
});
test('off-hours work persists; trusted urgent incidents run immediately', async t => {
  const { team, calls, setTime } = fixture(t); setTime('2026-11-03T03:00:00Z');
  team.ingest(message('Maya, review')); await team.tick(); assert.equal(calls.length, 0);
  team.ingest(message('security incident', { ts: '11.01', bot_id: 'BMON', app_id: 'AMONITOR' }));
  await team.tick(); assert.ok(calls.some(c => c[0] === 'post'));
});
test('Mark can explicitly request off-hours urgent incident triage', async t => {
  const { team, calls, setTime } = fixture(t); setTime('2026-11-03T03:00:00Z');
  team.ingest(message('urgent outage')); await team.tick();
  assert.ok(calls.some(c => c[0] === 'generate' && c[1] === 'riley'));
});
test('approved revisions are superseded before queued writes can run', async t => {
  const { team, calls } = fixture(t);
  const hash = team.stage(proposal()); await team.tick();
  team.ingest(message(`approve issue ${hash}`, { ts: '20.1', thread_ts: '10.01' }));
  team.stage(proposal({ title: 'Changed requirement' }));
  await team.tick(); assert.equal(calls.filter(c => c[0] === 'create').length, 0);
});
test('peer reviews execute before the owner with bounded real handoffs', async t => {
  const { team, calls } = fixture(t); team.ingest(message('Everyone, please review')); await team.tick();
  const gens = calls.filter(c => c[0] === 'generate'); assert.deepEqual(gens.map(g => g[1]), ['devon', 'riley', 'maya']);
  assert.equal(gens[0][2].colleagues.length, 0);
  assert.equal(gens.at(-1)[2].colleagues.length, 2);
  assert.equal(calls.filter(c => c[0] === 'post').length, 3);
});
test('capacity exhaustion acknowledges once and leaves a durable follow-up', async t => {
  const { team, calls, store } = fixture(t); team.c.monthlyTokens = 100;
  team.ingest(message('Maya, review')); await team.tick();
  const j = store.state.jobs[0]; assert.equal(j.status, 'queued'); assert.ok(j.due > 0);
  j.due = 0; await team.tick(); assert.equal(calls.filter(c => c[0] === 'post').length, 1); assert.equal(calls.filter(c => c[0] === 'generate').length, 0);
});
test('approval binds actor, thread and exact revision; duplicates create once', async t => {
  const { team, calls, store } = fixture(t); const hash = team.stage(proposal()); await team.tick();
  assert.equal(team.ingest(message(`approve issue ${hash}`, { user: 'UCOLLEAGUE', ts: '20.1', thread_ts: '10.01' })), false);
  assert.equal(team.ingest(message(`approve issue ${hash}`, { ts: '20.1', thread_ts: 'WRONG' })), false);
  assert.equal(team.ingest(message(`approve issue ${hash}`, { ts: '20.1', thread_ts: '10.01' })), true);
  await team.tick(); assert.equal(store.state.proposals[hash].status, 'created');
  assert.equal(team.ingest(message(`approve issue ${hash}`, { ts: '21.1', thread_ts: '10.01' })), false);
  await team.tick(); assert.equal(calls.filter(c => c[0] === 'create').length, 1);
});
test('new revisions and modified snapshots invalidate old approval', async t => {
  const { team, store } = fixture(t); const old = team.stage(proposal()); team.stage(proposal({ title: 'Changed scope' }));
  assert.equal(team.ingest(message(`approve issue ${old}`, { ts: '20.1', thread_ts: '10.01' })), false);
  const hash = team.stage(proposal({ title: 'Another revision' })); store.state.proposals[hash].proposal.body = 'tampered';
  assert.equal(team.ingest(message(`approve issue ${hash}`, { ts: '20.1', thread_ts: '10.01' })), false);
});
test('incomplete research and off-repository evidence cannot be staged', t => {
  const { team } = fixture(t); assert.throws(() => team.stage(proposal({ findings: {} }))); assert.throws(() => team.stage(proposal({ sources: ['https://example.com'] })));
});
test('final acceptance is separate from verification and cannot auto-close issues', async t => {
  const { team, calls, store } = fixture(t);
  const hash = team.stage(proposal({ kind: 'verification', issue: 378, commit: 'a'.repeat(40) })); await team.tick();
  assert.equal(calls.filter(c => c[0] === 'accept').length, 0);
  team.ingest(message(`accept issue ${hash}`, { ts: '21.1', thread_ts: '10.01' })); await team.tick();
  assert.equal(store.state.proposals[hash].status, 'accepted'); assert.equal(calls.filter(c => c[0] === 'accept').length, 1);
  assert.equal(store.state.proposals[hash].approval.actor, 'UOWNER');
});
test('unknown external-write outcomes halt without retry; startup preserves uncertainty', async t => {
  const { team, store, dir, calls } = fixture(t, { createIssue: async () => { throw Error('response lost'); } });
  const hash = team.stage(proposal()); await team.tick(); team.ingest(message(`approve issue ${hash}`, { ts: '21.1', thread_ts: '10.01' }));
  await team.tick(); assert.equal(store.state.jobs.at(-1).status, 'uncertain'); await team.tick();
  assert.equal(calls.filter(c => c[0] === 'post').length, 1);
  store.state.jobs.push({ id: 'crashed', status: 'running' }); store.save(); store.close();
  const reopened = new Store(dir); assert.equal(reopened.state.jobs.at(-1).status, 'uncertain'); reopened.close();
});
test('single-writer lock rejects concurrent workers and durable state survives restart', t => {
  const { team, store, dir } = fixture(t); team.ingest(message('Maya')); assert.throws(() => new Store(dir)); store.close();
  const reopened = new Store(dir); assert.equal(reopened.state.jobs.length, 1); assert.equal(reopened.state.seen['T1:C1:10.01'], true); reopened.close();
});
test('missing model usage fails safely instead of inventing telemetry', async t => {
  const { team, store } = fixture(t, { generate: async () => ({ text: 'hello' }) }); team.ingest(message('Maya')); await team.tick();
  assert.equal(store.state.jobs[0].status, 'uncertain'); assert.ok(Object.values(store.state.usage)[0].reserved > 0);
});
test('approval digest changes for different scope or evidence', () => { assert.notEqual(digest(proposal()), digest(proposal({ body: 'different' }))); });
test('GitHub reconciliation rejects forged markers and requires exact content/author', async t => {
  const io = adapters(config, { GITHUB_TOKEN: 'test-only' });
  t.mock.method(globalThis, 'fetch', async () => Response.json([{ number: 1, title: 'scope', body: 'marker', user: { login: 'someone-else' } }, { number: 2, title: 'scope', body: 'marker with changed scope', user: { login: 'QaloriHQ' } }]));
  assert.equal(await io.findIssue('marker', 'scope', 'marker'), null);
});
test('acceptance does not trust a colleague comment with a copied marker', async t => {
  const methods = []; const io = adapters(config, { GITHUB_TOKEN: 'test-only' });
  t.mock.method(globalThis, 'fetch', async (_url, options) => { methods.push(options.method); return Response.json(options.method === 'POST' ? { id: 1 } : [{ body: 'copied-marker', user: { login: 'someone-else' } }]); });
  await io.accept(378, { hash: 'abc' }, 'copied-marker');
  assert.deepEqual(methods, ['GET', 'POST']);
});
test('runtime GitHub credential must match the configured account', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ login: 'wrong-account' }));
  await assert.rejects(adapters(config, { GITHUB_TOKEN: 'test-only' }).identity(), /account mismatch/);
});
