export const PURPOSES = [
  { id: "fraud_prevention", label: "Fraud prevention" },
  { id: "unauthorized_transactions", label: "Unauthorized transaction prevention" },
  { id: "claims_liability", label: "Claims or liability management" },
  { id: "institutional_risk", label: "Institutional risk control" },
  { id: "consumer_disputes", label: "Consumer disputes or inquiries" },
] as const;
export const KYU_FEE_CENTS = 500;
export const APP_ORIGIN = "https://staging-workforce.txkpro.com";
export function validPurpose(input: Record<string, unknown>) {
  return PURPOSES.some(p => p.id === input.purpose) && input.transactionCertified === true && input.nonEligibilityCertified === true &&
    (input.description === undefined || typeof input.description === "string" && input.description.length <= 500);
}
export function adultDate(dob: unknown, now = new Date()) {
  if (typeof dob !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return false;
  const date = new Date(`${dob}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== dob) return false;
  const cutoff = new Date(Date.UTC(now.getUTCFullYear() - 18, now.getUTCMonth(), now.getUTCDate()));
  return date <= cutoff && date.getUTCFullYear() >= 1900;
}
export type PrivateDetails = {
  firstName: string; lastName: string; dob: string; address: string; city: string; state: string; postalCode: string;
  ssn?: string; phone?: string; education?: string; employment?: string; licenses?: string;
};
// Fictional adult fixture for preparing the sandbox card, never provider identity proof.
export const SANDBOX_DETAILS: PrivateDetails = {
  firstName: "Sandbox", lastName: "Student", dob: "1990-01-01",
  address: "123 Test Street", city: "Austin", state: "TX", postalCode: "78701",
};
export function privateDetails(value: unknown): PrivateDetails {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Private details required");
  const v = value as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const field of ["firstName", "lastName", "dob", "address", "city", "state", "postalCode", "ssn", "phone", "education", "employment", "licenses"]) {
    if (v[field] === undefined) continue;
    if (typeof v[field] !== "string" || v[field].length > (['education','employment','licenses'].includes(field) ? 2000 : 200)) throw new Error("Invalid private details");
    out[field] = v[field].trim();
  }
  for (const [field, label] of Object.entries({firstName:"First name",lastName:"Last name",dob:"Date of birth",address:"Street address",city:"City",state:"State",postalCode:"ZIP code"})) {
    if (!out[field]) throw new Error(`${label} is required.`);
  }
  if (!adultDate(out.dob)) throw new Error("Enter a valid date of birth for an adult aged 18 or older.");
  if (!/^[A-Z]{2}$/.test(out.state)) throw new Error("Enter a two-letter US state code, such as TX.");
  if (!/^\d{5}(-\d{4})?$/.test(out.postalCode)) throw new Error("Enter a valid ZIP code, such as 78701 or 78701-1234.");
  if (out.ssn && !/^\d{9}$/.test(out.ssn)) throw new Error("SSN must contain all 9 digits. Leave this optional field blank for sandbox testing; the last 4 digits alone cannot be saved.");
  return out as PrivateDetails;
}
export function consentAccepted(ids: unknown, parties: { id: string }[]) {
  return Array.isArray(ids) && ids.length === parties.length && new Set(ids).size === ids.length && parties.every(p => ids.includes(p.id));
}
// The only body allowed to leave TXKPRO is one of the fixed documented mock fixtures.
// Caller-provided employer, member, purpose, Stripe or candidate data is never projected.
export function fixtureOnly(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("Authenticate payload denied");
  return expected;
}
export type CardRequest = {
  id: string; name: string; products: string[]; purpose: string; description: string; status: string;
  consent: string; parties: {id: string; name: string; text: string; url?: string}[]; version: string; totalCents: number;
};
export type CardWorkspace = {
  status: string; paid: boolean; ready: boolean; name: string; requests: CardRequest[];
};

export type ProgressStep = {id:string;label:string;complete:boolean;detail:string};
export function setupProgress(card: CardWorkspace): ProgressStep[] {
  return [
    {id:'details',label:'Private information',complete:card.ready,detail:card.ready?'Prepared':'Save your test information'},
    {id:'payment',label:'One-time fee',complete:card.paid,detail:card.paid?'Payment confirmed':'Pay or resume the $5 test fee'},
    {id:'identity',label:'Identity verification',complete:card.status==='verified'&&card.paid&&card.ready,detail:card.status==='verified'&&card.paid&&card.ready?'Verified (sandbox)':card.status==='processing'?'Stripe is processing':card.status==='revoked'?'Card deactivated':card.status==='cancelled'?'Verification cancelled':card.paid?'Complete Stripe test verification':'Available after payment'},
  ];
}
export function requestProgress(request: CardRequest): ProgressStep[] {
  return [
    {id:'sharing',label:'Share AuthCard',complete:request.status==='shared',detail:request.status==='shared'?'Access shared':request.status==='revoked'?'Access revoked':request.status==='declined'?'Request declined':'Review sharing request'},
    {id:'authorization',label:'Authorize order',complete:request.status==='shared'&&request.consent==='authorized',detail:request.status==='shared'&&request.consent==='authorized'?'Order authorized':request.consent==='changed'?'Disclosures changed':'Review and accept all disclosures'},
  ];
}
