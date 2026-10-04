import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
const root = new URL('../', import.meta.url);
const name = readdirSync(new URL('supabase/staging/migrations/', root))
  .find(p => p.endsWith('_workforce_sec205_scoped_employer_helpers.sql'));
const sql = readFileSync(new URL(`supabase/staging/migrations/${name}`, root), 'utf8');
const body = fn => sql.slice(sql.indexOf(`function security.${fn}(`)).split('$$;')[0];
test('platform shortcut requires active account and platform membership', () => {
  assert.match(body('is_admin'), /u\.auth_user_id=\(select auth\.uid\(\)\)/);
  assert.match(body('is_admin'), /lower\(coalesce\(u\.status,''\)\)='active'/);
  assert.match(body('is_admin'), /lower\(r\.scope_type\)='platform'/);
  assert.match(body('is_admin'), /lower\(r\.status\)='active'/);
});
test('company helpers gate every membership and legacy path on active account', () => {
  for (const fn of ['has_employer_role', 'member_of_employer']) {
    assert.match(body(fn), /u\.auth_user_id=\(select auth\.uid\(\)\).*lower\(coalesce\(u\.status,''\)\)='active'/s);
    assert.match(body(fn), /and \(\s+security\.is_admin\(\)/);
    assert.match(body(fn), /r\.scope_id=p_employer_id/);
    assert.match(body(fn), /c\.contractor_id=p_employer_id and c\.owner_user_id=security\.current_legacy_user_id\(\)/);
  }
  assert.match(body('has_employer_role'), /'contractor_owner' and 'employer_owner'/);
  assert.match(body('has_employer_role'), /'contractor_recruiter' and 'recruiter'/);
});
test('private definers retain fixed path and revoke anonymous execution', () => {
  assert.equal((sql.match(/security definer set search_path = ''/g) || []).length, 3);
  assert.equal((sql.match(/from public,anon;/g) || []).length, 3);
  assert.doesNotMatch(sql, /user_metadata|raw_user_meta_data|update public|delete from|drop /i);
});
