import { createHash } from 'node:crypto';

export const members = Object.freeze({
  maya: { name: 'Maya', role: 'Product & Design', expertise: /\b(product|design|ux|user experience)\b/i, voice: 'Curious, empathetic, practical. Explain user impact and simplify confusing workflows.' },
  devon: { name: 'Devon', role: 'Engineering', expertise: /\b(engineering|architecture|backend|integration)\b/i, voice: 'Thoughtful and precise. Explain technical decisions plainly and preserve authorization boundaries.' },
  riley: { name: 'Riley', role: 'Reliability & QA', expertise: /\b(reliability|qa|testing|incident|security)\b/i, voice: 'Steady, methodical, evidence-driven. Distinguish implementation, review, verification and acceptance.' },
});
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function workingHours(now) {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: '2-digit', hourCycle: 'h23' }).format(now));
  return hour >= 8 && hour < 18;
}
export function route(event, config) {
  if (!event || event.channel !== config.channelId || !event.user || !event.ts || event.subtype || event.bot_id || Object.values(config.memberIds).includes(event.user)) return null;
  const text = String(event.text || '');
  const direct = Object.keys(members).filter(id => text.includes(`<@${config.memberIds[id]}>`) || new RegExp(`(?:^|[\\s,])@?${members[id].name}\\b`, 'i').test(text));
  const all = /(?:<!channel>|<!here>|\b(?:everyone|all members|whole team)\b)/i.test(text);
  const deliberate = /\b(?:please|can|could|need|review|help|check|question|thoughts|take a look)\b/i.test(text) && (/\b(?:team|lead|perspective|review|help|question|thoughts)\b/i.test(text) || /^(?:product|design|ux|engineering|architecture|backend|integration|reliability|qa|testing|incident|security)[,:\s]+(?:can|could|please)\b/i.test(text));
  const specialty = deliberate ? Object.keys(members).filter(id => members[id].expertise.test(text)) : [];
  const targets = direct.length ? direct : all ? Object.keys(members) : specialty;
  if (!targets.length) return null;
  return { owner: targets[0], reviewers: targets.slice(1), urgent: false };
}
export function incidentRoute(event, config) {
  // Only configured monitoring app IDs can bypass the mention and hours rules.
  if (event?.channel !== config.channelId || !event.app_id || !config.monitorAppIds.includes(event.app_id) || !event.bot_id || !/\b(?:outage|security incident|data loss|critical workflow failure)\b/i.test(event.text || '')) return null;
  return { owner: 'riley', reviewers: ['devon'], urgent: true };
}
export function validateConfig(c, { activate = false } = {}) {
  if (c.repository !== 'QaloriHQ/txkpro-workforce' || !/^T[A-Z0-9]+$/.test(c.teamId || '') || !/^C[A-Z0-9]+$/.test(c.channelId || '')) throw Error('Invalid repository/workspace/channel');
  if (!/^U[A-Z0-9]+$/.test(c.ownerId || '') || !Array.isArray(c.allowedUserIds) || !c.allowedUserIds.includes(c.ownerId)) throw Error('Configure verified owner and participant IDs');
  if (Object.keys(c.memberIds || {}).sort().join() !== 'devon,maya,riley' || new Set(Object.values(c.memberIds)).size !== 3 || Object.values(c.memberIds).some(id => !/^U[A-Z0-9]+$/.test(id) || c.allowedUserIds.includes(id))) throw Error('Configure three distinct member IDs');
  if (!Array.isArray(c.monitorAppIds)) throw Error('monitorAppIds must be an array');
  if (activate && (!c.enabled || c.legacyListenerStopped !== true)) throw Error('Activation disabled or legacy listener not stopped');
  for (const k of ['monthlyTokens', 'taskTokens', 'incidentReserveTokens', 'maxOutputTokens', 'minDelayMs', 'maxDelayMs']) if (!Number.isSafeInteger(c[k]) || c[k] < 0) throw Error(`Invalid ${k}`);
  if (!c.maxOutputTokens || c.maxOutputTokens > 1200 || c.maxDelayMs < c.minDelayMs || c.maxDelayMs > 120000) throw Error('Invalid output or pacing limits');
  if (activate && (!c.model || c.monthlyTokens <= c.incidentReserveTokens || c.taskTokens < c.maxOutputTokens)) throw Error('Configure model and explicit usage limits');
}
export function approval(text) {
  const match = /^(approve issue|accept issue) ([a-f0-9]{64})$/i.exec(String(text || '').trim());
  return match ? { action: match[1].toLowerCase() === 'approve issue' ? 'create' : 'accept', hash: match[2].toLowerCase() } : null;
}
export function requireEvidence(p) {
  if (!p || !['proposal', 'verification'].includes(p.kind) || !p.title?.trim() || !p.body?.trim() || p.body.length > 30000 || p.title.length > 200) throw Error('Invalid proposal');
  if (!/^\d+\.\d+$/.test(p.threadTs || '')) throw Error('Proposal must bind to a Slack thread');
  for (const key of ['requirements', 'implementation', 'dependencies', 'alternatives', 'risks', 'acceptance']) {
    if (!p.findings?.[key]?.trim() || p.findings[key].length > 5000) throw Error(`Missing research: ${key}`);
  }
  if (!Array.isArray(p.sources) || p.sources.length < 1 || p.sources.length > 20 || p.sources.some(s => !/^https:\/\/github\.com\/QaloriHQ\/txkpro-workforce\/(?:blob|issues|pull|commit)\//.test(s))) throw Error('Require repository evidence links');
  if (p.kind === 'verification' && (!Number.isSafeInteger(p.issue) || p.issue <= 0 || !/^[a-f0-9]{40}$/.test(p.commit || ''))) throw Error('Verification needs issue and commit');
  return p;
}
