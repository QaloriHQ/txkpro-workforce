import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fundingAvailability } from '../lib/rewards/funding-availability.ts';
const env = {
  STRIPE_SANDBOX_SECRET_KEY: 'rk_test_example',
  STRIPE_SANDBOX_PUBLISHABLE_KEY: 'pk_test_example',
  STRIPE_SANDBOX_WEBHOOK_SECRET: 'whsec_example',
  REWARDS_SANDBOX_APP_ORIGIN: 'https://staging-workforce.txkpro.com',
  REWARDS_PRICING_VERSION: 'test-fixture',
  REWARDS_CARD_THIRD_PARTY_BPS: '0',
  REWARDS_CARD_THIRD_PARTY_FIXED_CENTS: '0',
  REWARDS_CARD_PAYMENT_METHOD_CONFIGURATION: 'pmc_example',
};
test('readiness is fail-closed, method-specific and contains no credentials', () => {
  assert.deepEqual(fundingAvailability({}), {card: false, ach: false});
  assert.deepEqual(fundingAvailability(env), {card: true, ach: false});
  for (const key of Object.keys(env)) {
    assert.equal(fundingAvailability({...env, [key]: undefined}).card, false, key);
  }
  assert.equal(fundingAvailability({...env, STRIPE_SANDBOX_SECRET_KEY:'sk_live_example'}).card, false);
  assert.equal(fundingAvailability({...env, REWARDS_CARD_THIRD_PARTY_BPS:'invalid'}).card, false);
  assert.equal(JSON.stringify(fundingAvailability(env)).includes('example'), false);
});
