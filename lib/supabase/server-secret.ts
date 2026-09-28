/** Validate without ever including the configured value in an error. */
export function normalizeServerSecret(raw: string | undefined): string {
  // Supabase secret keys and legacy service-role JWTs never contain whitespace.
  const key = raw?.replace(/\s/g, "");
  if (!key || !/^[A-Za-z0-9._~-]+$/.test(key)) {
    throw new Error("Supabase server secret configuration is invalid.");
  }
  return key;
}
