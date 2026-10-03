const MAX_REFERRAL_NOTE_LENGTH = 2000;

const DISALLOWED_REFERRAL_NOTE_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b(ssn|social security|date of birth|dob)\b/i, label: "government identifiers" },
  { pattern: /\b(disab(?:ility|led)|medical|diagnosis|medication|therapy|accommodation)\b/i, label: "medical or accommodation information" },
  { pattern: /\b(criminal|arrest|conviction|probation|parole|background check)\b/i, label: "criminal-history information" },
  { pattern: /\b(drug test|drug screen|substance|addiction)\b/i, label: "drug-screen or substance information" },
  { pattern: /\b(pregnan(?:t|cy)|childcare|marital|spouse|religion|race|ethnicity|citizenship|immigration)\b/i, label: "protected or regulated personal information" },
  { pattern: /\b(disciplinary|discipline|suspension|expelled|incident report|safety concern)\b/i, label: "institution-private conduct or safety notes" },
  { pattern: /\b(retention case|case note|intervention note|counseling note)\b/i, label: "private case notes" },
  { pattern: /\b(answer key|assessment answer|password|credential)\b/i, label: "private assessment or credential material" },
  { pattern: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/, label: "direct contact details" },
  { pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, label: "direct contact details" },
];

export type ReferralNotePolicyResult = {
  note: string | null;
  policy: "institution_shared_referral_note_v1";
};

export function validateReferralNotePolicy(
  value: string | null | undefined,
): ReferralNotePolicyResult {
  const note = typeof value === "string" ? value.trim() : "";
  if (!note) return { note: null, policy: "institution_shared_referral_note_v1" };

  if (note.length > MAX_REFERRAL_NOTE_LENGTH) {
    throw new Response("Referral note must be 2,000 characters or fewer.", {
      status: 400,
    });
  }

  const disallowed = DISALLOWED_REFERRAL_NOTE_PATTERNS.find(({ pattern }) =>
    pattern.test(note),
  );
  if (disallowed) {
    throw new Response(
      `Referral note cannot include ${disallowed.label}. Use professional readiness and employer-fit context only.`,
      { status: 400 },
    );
  }

  return { note, policy: "institution_shared_referral_note_v1" };
}
