import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildHiringJourneys } from '../lib/employer/candidate-pipeline.ts';

const common = { studentId: 's1', studentName: 'Demo Student', hiringNeedId: 'h1', updatedAt: '2026-10-01T12:00:00Z' };
const referral = (extra = {}) => ({ ...common, referralId: 'r1', status: 'viewed', hiringNeedTitle: 'Welder', referredAt: '2026-09-01T12:00:00Z', ...extra });
const interview = (extra = {}) => ({ ...common, interviewRequestId: 'i1', referralId: 'r1', status: 'scheduled', roleTitle: 'Welder', sentAt: '2026-09-02T12:00:00Z', ...extra });
const placement = (extra = {}) => ({ ...common, placementId: 'p1', interviewRequestId: 'i1', referralId: 'r1', status: 'pending_start', roleTitle: 'Welder', hireDate: '2026-10-20', employmentStartDate: null, startConfirmedAt: null, ...extra });
const records = (extra = {}) => ({ referrals: [], interviews: [], placements: [], ...extra });
const stage = (p) => buildHiringJourneys(records({ placements: [p] }))[0].stage;

test('interview progress changes with actual workflow states and closes terminal attempts', () => {
  for (const [status, expected] of Object.entries({ draft: 'New / Referred', sent: 'Interview Requested', no_response: 'Interview Requested', accepted: 'Interviewing', scheduling: 'Interviewing', scheduled: 'Interviewing', completed: 'Decision', declined: 'Closed', cancelled: 'Closed', expired: 'Closed' })) {
    assert.equal(buildHiringJourneys(records({ interviews: [interview({ status })] }))[0].stage, expected);
  }
});
test('scheduled dates, retention and legacy active state cannot establish employment', () => {
  for (const status of ['pending_start', 'active']) {
    assert.equal(stage(placement({ status, hireDate: '2020-01-01', milestoneCount: 3, startedAt: '2020-01-01' })), 'Hire Scheduled');
    assert.equal(stage(placement({ status, employmentStartDate: '2026-10-01' })), 'Hire Scheduled');
    assert.equal(stage(placement({ status, startConfirmedAt: '2026-10-01T10:00:00Z' })), 'Hire Scheduled');
  }
  assert.equal(stage(placement({ status: 'active', employmentStartDate: '2026-10-01', startConfirmedAt: '2026-10-01T10:00:00Z' })), 'Employment Started');
  assert.equal(stage(placement({ status: 'ended', employmentStartDate: '2026-10-01', startConfirmedAt: '2026-10-01T10:00:00Z' })), 'Closed');
});
test('unknown states and hired referrals without placement evidence require review', () => {
  assert.equal(stage(placement({ status: 'unknown' })), 'Needs Review');
  assert.equal(stage(placement({ status: 'future_status' })), 'Needs Review');
  for (const status of ['hired', 'future_status']) assert.equal(buildHiringJourneys(records({ referrals: [referral({ status })] }))[0].stage, 'Needs Review');
  assert.equal(buildHiringJourneys(records({ interviews: [interview({ status: 'future_status' })] }))[0].stage, 'Needs Review');
});
test('linked records produce one journey without manufacturing skipped interview evidence', () => {
  const linked = records({ referrals: [referral()], interviews: [interview({ status: 'completed', completedAt: '2026-10-01' })], placements: [placement()] });
  const result = buildHiringJourneys(linked);
  assert.equal(result.length, 1);
  assert.equal(result[0].links.length, 3);
  assert.equal(result[0].steps.find(s => s.current).label, 'Hire Scheduled');
  const direct = buildHiringJourneys(records({ placements: [placement({ interviewRequestId: null, referralId: null })] }))[0];
  assert.equal(direct.steps.find(s => s.label === 'Decision').recorded, false);
  assert.equal(direct.steps.find(s => s.label === 'Interviewing').recorded, false);
});
test('separate attempts remain visible and exact detail focus cannot borrow another attempt', () => {
  const input = records({ interviews: [interview(), interview({ interviewRequestId: 'i2', referralId: null, status: 'declined' })], placements: [placement()] });
  assert.equal(buildHiringJourneys(input).length, 2);
  assert.equal(buildHiringJourneys(input, { focus: { kind: 'interview', id: 'i2' } })[0].stage, 'Closed');
  assert.equal(buildHiringJourneys(input, { focus: { kind: 'interview', id: 'i1' } })[0].stage, 'Hire Scheduled');
  assert.deepEqual(buildHiringJourneys(input, { studentId: 'other' }), []);
  assert.deepEqual(buildHiringJourneys(input, { hiringNeedId: 'other' }), []);
  assert.deepEqual(buildHiringJourneys(input, { focus: { kind: 'placement', id: 'missing' } }), []);
});
test('mismatched students, hiring needs and conflicting referral links never get stitched together', () => {
  for (const extra of [{ studentId: 'other' }, { hiringNeedId: 'other' }, { referralId: 'other' }]) {
    const result = buildHiringJourneys(records({ interviews: [interview(extra)], placements: [placement()] }), { focus: { kind: 'placement', id: 'p1' } });
    assert.equal(result[0].recordIds.interview, undefined);
  }
  const result = buildHiringJourneys(records({ referrals: [referral({ hiringNeedId: 'h2' })], interviews: [interview()], placements: [placement({ hiringNeedId: null })] }), { focus: { kind: 'placement', id: 'p1' } });
  assert.equal(result[0].recordIds.referral, undefined);
});
test('newest journeys come first, private source fields stay out of output and inputs stay unchanged', () => {
  const input = records({ referrals: [referral({ institutionSharedNote: 'PRIVATE', technicalSnapshot: { secret: 'PRIVATE' } })], placements: [placement({ hireDate: '2026-10-02' })], interviews: [interview({ interviewRequestId: 'i2', referralId: null, updatedAt: '2026-10-01T23:00:00-05:00', message: 'PRIVATE', evaluation: { summary: 'PRIVATE' } })] });
  const before = JSON.stringify(input);
  const result = buildHiringJourneys(input);
  assert.equal(result[0].key, 'interview:i2');
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|technicalSnapshot|evaluation|institutionSharedNote/);
  assert.equal(JSON.stringify(input), before);
});
