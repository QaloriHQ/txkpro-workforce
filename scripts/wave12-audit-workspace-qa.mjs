import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { auditCsv, csvCell } from '../lib/audit-workspace/csv.ts';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const migration = readdirSync(new URL('../supabase/staging/migrations', import.meta.url)).find(n => n.endsWith('_workforce_wave12_audit_workspace.sql'));
const sql = read(`supabase/staging/migrations/${migration}`);
test('CSV neutralizes formulas including leading whitespace and control characters', () => {
  for (const value of ['=1+1', '+SUM(A1)', '-1', '@foo', ' \t=1', '\r\n+cmd', '\u0000@cmd']) assert.equal(csvCell(value), `"'${value}"`);
  assert.equal(csvCell('plain "text", with\nnewline'), '"plain ""text"", with\nnewline"');
  assert.equal(csvCell(null), '""');
});
test('CSV accepts only approved fields, excluding extra payload and auth identifiers', () => {
  const output = auditCsv([{ recordId: 'record', metadata: 'PRIVATE', actorAuthUserId: 'SECRET', before_json: 'RAW' }]);
  assert.ok(output.includes('record'));
  for (const secret of ['PRIVATE', 'SECRET', 'RAW', 'metadata', 'actorAuthUserId', 'before_json']) assert.ok(!output.includes(secret));
  assert.equal(output.split('\r\n')[0].split(',').length, 13);
});
test('database guard ties active authorized roles to canonical scope and excludes payloads', () => {
  assert.match(sql, /retention_membership_matches\(r.id,p_institution_id,p_cohort_id\)/);
  assert.match(sql, /lower\(u.status\)='active'/);
  assert.match(sql, /v_actor is null or not security.audit_workspace_access/);
  const projection = sql.slice(sql.indexOf("'recordId',record_id"), sql.indexOf('into v_total,v_items'));
  assert.doesNotMatch(projection, /actor_auth|metadata|email|phone|notes/);
  assert.match(projection, /security.audit_safe_status\(before_json\)/);
  assert.doesNotMatch(sql, /wf_employer_candidate_notes|wf_interview_evaluations|update public|delete from/);
});
test('export is bounded, audited and exposed only through verified server auth', () => {
  assert.match(sql, /case when p_export then 1000 else 25 end/);
  assert.match(sql, /emit_workforce_event\('REPORT_EXPORTED'/);
  assert.match(sql, /set timezone='UTC'/);
  const repository = read('lib/audit-workspace/repository.ts');
  assert.ok(repository.indexOf('client.auth.getUser()') < repository.indexOf('client.rpc('));
  assert.doesNotMatch(repository, /SERVICE_ROLE|createAdmin|metadata.*role/);
  const route = read('app/api/audit/events/export/route.ts');
  assert.match(route, /export async function POST/);
  assert.match(route, /origin !== new URL\(request.url\).origin/);
  assert.match(route, /private, no-store/);
  assert.doesNotMatch(route, /export async function (PUT|PATCH|DELETE|GET)/);
});
