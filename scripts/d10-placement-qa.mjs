import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const name = readdirSync(new URL('../supabase/staging/migrations', import.meta.url)).find(p => p.endsWith('_workforce_d10_confirmed_employment_start.sql'));
const sql = read(`supabase/staging/migrations/${name}`);
const body = fn => sql.slice(sql.indexOf(`function public.${fn}(`)).split('$$;')[0];
test('scheduled dates cannot automatically establish employment', () => {
  assert.match(body('employer_record_hire'), /v_status:='pending_start'/);
  assert.doesNotMatch(body('employer_record_hire'), /p_hire_date>current_date/);
  assert.match(body('placement_confirm_start'), /p_start_date > .*::date/);
  assert.match(body('placement_confirm_start'), /for update/);
  assert.match(body('employer_update_placement_status'), /if v_new='active' then/);
  assert.match(body('placement_confirm_start'), /v\.employment_start_date<>p_start_date/);
});
test('confirmation evidence does not leak authenticated actor IDs into read models', () => {
  for (const fn of ['employer_placements_list','employer_placement_detail','student_placements_list','institution_student_profile','institution_employer_detail']) {
    assert.match(body(fn), /'officialPlacement',p\.start_confirmed_at is not null/);
    assert.doesNotMatch(body(fn), /start_confirmed_by_auth_user_id/);
  }
  assert.doesNotMatch(sql, /raw_user_meta_data|user_metadata/);
});
test('retention scheduling requires confirmed employment and leaves placement state alone', () => {
  assert.match(body('retention_claim_due_milestones'), /p\.status='active' and p\.start_confirmed_at is not null/);
  assert.doesNotMatch(body('retention_claim_due_milestones'), /update public\.wf_placements/);
});
test('scoped metrics use explicit confirmation evidence', () => {
  assert.match(body('institution_workforce_summary'), /count\(\*\) filter \(where p\.start_confirmed_at is not null\) as total_hires/);
  assert.match(body('institution_workforce_summary'), /'pendingStarts',pl\.pending_starts/);
  assert.match(body('institution_program_cohort_management'), /count\(distinct p\.placement_id\) filter \(where p\.start_confirmed_at is not null\)/);
  assert.match(body('institution_student_directory'), /p\.status='active' and p\.start_confirmed_at is not null/);
});
test('confirmation is authenticated and both employment mutations are button-opened modals', () => {
  assert.match(read('app/api/placements/[id]/confirm-start/route.ts'), /getAccountContext/);
  assert.match(read('components/placements/confirm-start-form.tsx'), /WorkspaceForm/);
  assert.match(read('components/employer/placement-status-actions.tsx'), /WorkspaceForm/);
  assert.doesNotMatch(read('components/employer/placement-status-actions.tsx'), /Mark Active|window\.prompt|window\.confirm/);
});
