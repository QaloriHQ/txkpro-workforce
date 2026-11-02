#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Store } from './store.mjs';
import { Team } from './team.mjs';
import { members, validateConfig } from './policy.mjs';
import { adapters, slack } from './adapters.mjs';

export async function main(argv = process.argv.slice(2), env = process.env) {
  const [command, input] = argv;
  const c = JSON.parse(fs.readFileSync(env.TXKPRO_TEAM_CONFIG || 'config/slack-team.example.json', 'utf8'));
  c.ownerId = env.SLACK_ALLOWED_USER_ID || c.ownerId;
  c.teamId = env.SLACK_TEAM_ID || c.teamId;
  validateConfig(c, { activate: command === 'serve' });
  const store = new Store(env.TXKPRO_TEAM_STATE_DIR || path.join(os.homedir(), '.txkpro', 'slack-team'));
  const team = new Team(store, c, adapters(c, env));
  if (command === 'stage') {
    try { console.log(JSON.stringify({ hash: team.stage(JSON.parse(fs.readFileSync(input, 'utf8'))), status: 'pending_owner_approval' })); } finally { store.close(); }
    return;
  }
  if (command === 'status') {
    try { console.log(JSON.stringify({ jobs: store.state.jobs.map(({ id, status, type }) => ({ id, status, type })), proposals: Object.entries(store.state.proposals).map(([hash, p]) => ({ hash, status: p.status })), usage: store.state.usage })); } finally { store.close(); }
    return;
  }
  if (command !== 'serve') { store.close(); throw Error('Use stage <proposal.json>, status, or serve'); }
  let stopped = false, socket, reconnect;
  let timer;
  const stop = () => {
    stopped = true; clearInterval(timer); clearTimeout(reconnect); socket?.close();
    // Keep the lock while in-flight work finishes; next startup treats interruptions as uncertain.
    const finish = () => team.busy ? setTimeout(finish, 100) : store.close();
    finish();
  };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    if (!env.SLACK_TEAM_APP_TOKEN || !env.GITHUB_TOKEN || !env.OPENROUTER_API_KEY) throw Error('Required service credentials unavailable');
    await team.io.identity();
    for (const id of Object.keys(members)) {
      const token = env[`SLACK_${id.toUpperCase()}_BOT_TOKEN`];
      if (!token) throw Error('Member credential unavailable');
      const auth = await slack('auth.test', token, {});
      if (auth.team_id !== c.teamId || auth.user_id !== c.memberIds[id]) throw Error('Member identity/workspace mismatch');
    }
    timer = setInterval(() => { team.tick().catch(() => console.error('[team] worker failed; inspect durable state')); }, 1000);
    // Context is limited to events observed in this process's approved channel,
    // plus bounded GitHub issue reads; never fetch unrelated Slack histories.
    const connect = async () => {
      if (stopped) return;
      try {
        const { url } = await slack('apps.connections.open', env.SLACK_TEAM_APP_TOKEN, {});
        if (typeof url !== 'string' || !url.startsWith('wss://')) throw Error('Invalid socket URL');
        socket = new WebSocket(url);
        socket.addEventListener('message', message => {
          try {
            const envelope = JSON.parse(String(message.data));
            if (envelope.type === 'disconnect') { socket.close(); return; }
            if (envelope.type === 'events_api') team.ingest(envelope.payload);
            if (envelope.envelope_id) socket.send(JSON.stringify({ envelope_id: envelope.envelope_id }));
          } catch { console.error('[team] event not acknowledged; inspect durable state'); }
        });
        socket.addEventListener('close', () => { if (!stopped) reconnect = setTimeout(connect, 10000); });
        socket.addEventListener('error', () => socket.close());
      } catch { if (!stopped) reconnect = setTimeout(connect, 10000); }
    };
    await connect();
    console.log('[team] worker started; activation is not pilot acceptance');
  } catch (error) { stop(); throw error; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => { console.error('[team] startup failed; check identity, credentials, budget and listener configuration'); process.exitCode = 1; });
