#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DISCORD_ALLOWED_USER_ID:-}" ]]; then
  printf '%s\n' '{"action":"deny","message":"connector owner is not configured"}'
  exit 0
fi

payload="$(cat)"
participant_key="$(
  printf '%s' "$payload" | node -e '
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", chunk => input += chunk);
    process.stdin.on("end", () => {
      try {
        const event = JSON.parse(input);
        process.stdout.write(event?.payload?.actor?.participantKey ?? "");
      } catch {
        process.stdout.write("");
      }
    });
  '
)"

expected="discord:user:${DISCORD_ALLOWED_USER_ID}"

if [[ "$participant_key" == "$expected" ]]; then
  printf '%s\n' '{"action":"allow"}'
else
  printf '%s\n' '{"action":"deny","message":"unauthorized"}'
fi
