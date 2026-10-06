// Only fixed categories cross the client/server boundary. Never send raw Stripe errors.
export const fundingDiagnosticStages = ["validation", "confirmation"] as const;
export const fundingDiagnosticCategories = [
  "sdk_unavailable",
  "email_required",
  "address_required",
  "return_url",
  "element_state",
  "network",
  "integration",
  "unexpected",
] as const;
export function fundingDiagnostic(stage: string, error: unknown) {
  const e =
    error && typeof error === "object"
      ? (error as { name?: unknown; message?: unknown })
      : {};
  const message = typeof e.message === "string" ? e.message : "";
  const category = /not a function|undefined.*(confirm|validate)/i.test(message)
    ? "sdk_unavailable"
    : /email/i.test(message)
      ? "email_required"
      : /billing|address/i.test(message)
        ? "address_required"
        : /return.?url|redirect/i.test(message)
          ? "return_url"
          : /mount|element|destroy/i.test(message)
            ? "element_state"
            : /network|fetch|connection|timeout/i.test(message)
              ? "network"
              : e.name === "IntegrationError"
                ? "integration"
                : "unexpected";
  return {
    stage: fundingDiagnosticStages.includes(
      stage as (typeof fundingDiagnosticStages)[number],
    )
      ? stage
      : "confirmation",
    category,
  };
}
export function validFundingDiagnostic(input: Record<string, unknown>) {
  return (
    fundingDiagnosticStages.includes(
      input.stage as (typeof fundingDiagnosticStages)[number],
    ) &&
    fundingDiagnosticCategories.includes(
      input.category as (typeof fundingDiagnosticCategories)[number],
    )
  );
}
