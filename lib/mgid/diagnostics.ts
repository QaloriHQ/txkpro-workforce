// Fixed operational codes only: never URLs, response bodies, visitor data or errors.
export type MgidDiagnostic = {
  outcome: "invalid_input" | "http_error" | "invalid_response" | "oversized_response" |
    "empty" | "invalid_creative" | "excluded_category" | "unsafe_url" | "timeout" |
    "network_error" | "accepted" | "disabled" | "invalid_page" | "missing_ip" |
    "reservation_rejected" | "storage_error";
  status?: number;
  field?: "record" | "title" | "description" | "category";
};

export function logMgidDiagnostic(diagnostic: MgidDiagnostic) {
  // Construct the output explicitly; additional caller fields must never leak.
  console.info("mgid_native_delivery", {
    outcome: diagnostic.outcome,
    ...(["record", "title", "description", "category"].includes(diagnostic.field || "") ? { field: diagnostic.field } : {}),
    ...(diagnostic.status && Number.isInteger(diagnostic.status) && diagnostic.status >= 100 && diagnostic.status <= 599
      ? { status: diagnostic.status } : {}),
  });
}
