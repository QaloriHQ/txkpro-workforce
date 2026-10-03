export function RetentionTimestamp({
  value,
  empty = "—",
}: {
  value: string | null;
  empty?: string;
}) {
  // Deterministic SSR time; label the zone explicitly. The editor uses the operator's local zone.
  return value ? (
    <time dateTime={value}>
      {new Date(value).toLocaleString("en-US", {
        timeZone: "UTC",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })}{" "}
      UTC
    </time>
  ) : (
    <>{empty}</>
  );
}
