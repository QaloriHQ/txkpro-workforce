# Headless Cline + Slack in GitHub Codespaces

Slack is the primary remote Cline transport for TXKPRO Workforce. The repository uses Cline's native Slack **Socket Mode** connector so the Codespace does not need a public webhook port for normal Slack operation.

## Why Slack is primary

- Long engineering responses fit much better than Discord.
- Threads map naturally to Cline sessions.
- Socket Mode avoids a public Codespaces webhook endpoint.
- The TXKPRO protocol remains authoritative regardless of chat transport.
- Chat length must never cause the agent to skip roadmap discovery, dependency checks, source review, Definition of Ready, verification planning, or approval gates.

## Repository files

- `.devcontainer/start-agent.sh` — connector router; Slack is primary.
- `.devcontainer/start-slack-agent.sh` — validates Slack credentials and starts Cline in Socket Mode.
- `.devcontainer/slack-access-hook.sh` — owner/workspace allowlist.
- `.devcontainer/start-discord-agent.sh` — preserved Discord fallback.
- `config/slack-cline-app-manifest.json` — reusable Slack app configuration.

## Create the Slack app

1. Open Slack's app management page.
2. Choose **Create New App → From an app manifest**.
3. Select the TXKPRO Slack workspace.
4. Paste the contents of `config/slack-cline-app-manifest.json`.
5. Create the app and install it to the workspace.
6. Under **OAuth & Permissions**, copy the **Bot User OAuth Token**. It begins with `xoxb-`.
7. Under **Basic Information → App-Level Tokens**, generate an app token with the `connections:write` scope. It begins with `xapp-`.
8. In your Slack profile, copy your own **Member ID**.

The manifest enables Socket Mode, the Messages tab, app mentions, direct-message events, channel/private-channel message events, and the scopes Cline needs to reply in threads and DMs.

## Codespaces secrets

Add these as **GitHub Codespaces secrets** for this repository:

- `SLACK_BOT_TOKEN` — the `xoxb-` Bot User OAuth Token.
- `SLACK_APP_TOKEN` — the `xapp-` app-level Socket Mode token.
- `SLACK_ALLOWED_USER_ID` — your Slack Member ID.

Optional:

- `SLACK_TEAM_ID` — workspace/team ID. Startup resolves it from `auth.test` automatically and rejects a mismatch when this value is provided.
- `PROJECTS_TOKEN` — required for roadmap reads.
- Existing Discord secrets may remain configured as fallback credentials.

Do not paste secret values into Git, issues, Slack messages, or Cline prompts.

After adding new Codespaces secrets, **stop and restart the Codespace** so the environment is reinjected.

## Startup behavior

The default repository configuration is:

```text
TXKPRO_CLINE_PRIMARY_CONNECTOR=slack
TXKPRO_ENABLE_DISCORD_BACKUP=false
```

On Codespace start:

1. `.devcontainer/start-agent.sh` checks whether Slack credentials are available.
2. If available, it starts the Slack connector.
3. `start-slack-agent.sh` calls Slack `auth.test`, resolves the workspace ID, refreshes Cline configuration, refreshes `origin/main`, and starts Cline in Plan mode with tools enabled.
4. `slack-access-hook.sh` accepts only the configured Slack user in the resolved workspace.
5. If Slack is not configured but the existing Discord credentials are available, the router temporarily falls back to Discord and prints a warning.
6. Discord can also be enabled as a backup by setting `TXKPRO_ENABLE_DISCORD_BACKUP=true`.

Slack Socket Mode does **not** require making Codespaces port 8788 public.

## Start manually

```bash
bash .devcontainer/start-agent.sh
```

Slack-only:

```bash
bash .devcontainer/start-slack-agent.sh
```

Stop Slack:

```bash
cline connect slack --stop
```

## Verify

After the connector starts, the terminal should print the Slack workspace ID, bot user ID, allowed owner user ID, and:

```text
transport: socket mode
mode: plan
```

In Slack, either:

- DM the TXKPRO Cline app; or
- invite it to a dedicated private channel and mention it.

For Cline slash-style chat commands in a channel, mention the bot first so Slack delivers the text, for example:

```text
@TXKPRO Cline /whereami
```

For normal TXKPRO workflow:

```text
@TXKPRO Cline What's next?
```

The agent should complete read-only roadmap discovery, dependency checks, preflight, and authoritative-source review before presenting the next eligible task and asking for approval to mutate.

## Security

The connector startup validates the bot token with Slack `auth.test`, derives the actual workspace/team ID, and exports that ID only to the local connector process.

The access hook allows only:

```text
slack:team:<resolved-team-id>:user:<SLACK_ALLOWED_USER_ID>
```

All other Slack participants are denied by the hook even if the app is present in the same workspace/channel.

Use a dedicated private Slack channel for TXKPRO engineering work. Invite only the owner and the app.

## Transport invariant

Slack is a presentation layer, not the protocol engine. The AI must never shorten **execution of the TXKPRO protocol** because of message limits.

If a response is long, it may compress presentation, split the answer across thread messages, or summarize repeated evidence, but it must still complete the required read-only checks before reaching an eligibility or approval conclusion.
