#!/usr/bin/env bash
set -euo pipefail

WORKSPACE_ROOT="${CODESPACE_VSCODE_FOLDER:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
ENV_FILE="$HOME/.txkpro-agent-env.sh"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

primary="${TXKPRO_CLINE_PRIMARY_CONNECTOR:-slack}"
discord_backup="${TXKPRO_ENABLE_DISCORD_BACKUP:-false}"

slack_ready=0
if [[ -n "${SLACK_BOT_TOKEN:-}" && -n "${SLACK_APP_TOKEN:-}" && -n "${SLACK_ALLOWED_USER_ID:-}" ]]; then
  slack_ready=1
fi

discord_ready=0
if [[ -n "${DISCORD_BOT_TOKEN:-}" && -n "${DISCORD_ALLOWED_USER_ID:-}" && -n "${DISCORD_APPLICATION_ID:-}" ]]; then
  discord_ready=1
fi

start_slack() {
  bash "$WORKSPACE_ROOT/.devcontainer/start-slack-agent.sh"
}

start_discord() {
  bash "$WORKSPACE_ROOT/.devcontainer/start-discord-agent.sh"
}

case "$primary" in
  slack)
    if [[ "$slack_ready" -eq 1 ]]; then
      start_slack
      if [[ "$discord_backup" == "true" && "$discord_ready" -eq 1 ]]; then
        echo "[cline-router] starting Discord as optional backup connector"
        start_discord
      fi
      exit 0
    fi

    if [[ "$discord_ready" -eq 1 ]]; then
      echo "[cline-router] warning: Slack is primary but not configured; using Discord fallback" >&2
      echo "[cline-router] add Codespaces secrets SLACK_BOT_TOKEN, SLACK_APP_TOKEN, and SLACK_ALLOWED_USER_ID, then restart the Codespace" >&2
      start_discord
      exit 0
    fi

    echo "[cline-router] Slack is primary but required Slack secrets are missing, and Discord fallback is unavailable." >&2
    echo "[cline-router] required Slack Codespaces secrets: SLACK_BOT_TOKEN, SLACK_APP_TOKEN, SLACK_ALLOWED_USER_ID" >&2
    exit 1
    ;;

  discord)
    if [[ "$discord_ready" -eq 1 ]]; then
      start_discord
      exit 0
    fi
    echo "[cline-router] Discord is selected but its required secrets are missing." >&2
    exit 1
    ;;

  *)
    echo "[cline-router] unsupported TXKPRO_CLINE_PRIMARY_CONNECTOR: $primary" >&2
    echo "[cline-router] supported values: slack, discord" >&2
    exit 2
    ;;
esac
