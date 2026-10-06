// Public readiness flags only. Never serialize environment values.
export function fundingAvailability(env: Record<string, string | undefined>) {
  const stripe = /^(sk|rk)_test_/.test(env.STRIPE_SANDBOX_SECRET_KEY || "") &&
    Boolean(env.STRIPE_SANDBOX_PUBLISHABLE_KEY?.startsWith("pk_test_")) &&
    Boolean(env.STRIPE_SANDBOX_WEBHOOK_SECRET?.startsWith("whsec_")) &&
    env.REWARDS_SANDBOX_APP_ORIGIN === "https://staging-workforce.txkpro.com";
  function ready(method: string) {
    const prefix = `REWARDS_${method}`;
    return stripe && Boolean(env.REWARDS_PRICING_VERSION) &&
      /^\d+$/.test(env[`${prefix}_THIRD_PARTY_BPS`] || "") &&
      /^\d+$/.test(env[`${prefix}_THIRD_PARTY_FIXED_CENTS`] || "") &&
      Boolean(env[`${prefix}_PAYMENT_METHOD_CONFIGURATION`]?.startsWith("pmc_"));
  }
  return { card: ready("CARD"), ach: ready("ACH") };
}
