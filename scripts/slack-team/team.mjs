import { randomInt } from 'node:crypto';
import { approval, digest, incidentRoute, members, requireEvidence, route, workingHours } from './policy.mjs';

export class Team {
  constructor(store, config, adapters, clock = () => new Date()) {
    this.store = store; this.c = config; this.io = adapters; this.clock = clock;
  }
  stage(input) {
    const proposal = structuredClone(requireEvidence(input));
    const hash = digest(proposal);
    if (this.store.state.proposals[hash]) return hash;
    // A new revision invalidates all older proposals of the same kind in this thread.
    for (const p of Object.values(this.store.state.proposals)) if (p.proposal.threadTs === proposal.threadTs && p.proposal.kind === proposal.kind && ['pending', 'approved'].includes(p.status)) {
      p.status = 'superseded';
      for (const job of this.store.state.jobs) if (job.hash === p.hash && job.status === 'queued') job.status = 'superseded';
    }
    this.store.state.proposals[hash] = { proposal, status: 'pending', hash };
    this.store.state.jobs.push({ id: 'announce:' + hash, type: 'announce', hash, owner: proposal.kind === 'verification' ? 'riley' : 'maya', thread: proposal.threadTs, status: 'queued', due: 0 });
    this.store.audit('proposal_staged', { hash });
    return hash;
  }
  ingest(payload) {
    if (payload.team_id !== this.c.teamId || payload.type !== 'event_callback') return false;
    const e = payload.event;
    if (!e || e.channel !== this.c.channelId || !e.ts) return false;
    const ownerIncident = e.user === this.c.ownerId && !e.bot_id && !e.subtype && /\burgent\b/i.test(e.text || '') && /\b(?:outage|security incident|data loss|critical workflow failure)\b/i.test(e.text || '');
    const urgent = incidentRoute(e, this.c) || (ownerIncident ? { owner: 'riley', reviewers: ['devon'], urgent: true } : null);
    if (!urgent && (!this.c.allowedUserIds.includes(e.user) || e.subtype || e.bot_id || Object.values(this.c.memberIds).includes(e.user))) return false;
    // app_mention and message subscriptions/apps deliver different event IDs for the same message.
    const id = `${payload.team_id}:${e.channel}:${e.ts}`;
    if (this.store.state.seen[id]) return false;
    const a = approval(e.text);
    const r = urgent || route(e, this.c);
    if (!a && !r) return false;
    const thread = e.thread_ts || e.ts;
    if (a) {
      const p = this.store.state.proposals[a.hash];
      if (e.user !== this.c.ownerId || !p || !p.presented || p.status !== 'pending' || p.proposal.threadTs !== thread || digest(p.proposal) !== a.hash || (a.action === 'create') !== (p.proposal.kind === 'proposal')) return false;
      p.status = 'approved';
      p.approval = { actor: e.user, team: payload.team_id, channel: e.channel, ts: e.ts, thread, action: a.action, hash: a.hash };
      this.store.state.jobs.push({ id, type: a.action, hash: a.hash, owner: a.action === 'accept' ? 'riley' : 'maya', thread, status: 'queued', due: 0 });
    } else {
      this.store.state.jobs.push({ id, type: 'discussion', ...r, text: String(e.text || '').slice(0, 12000), actor: e.user, thread, status: 'queued', due: this.clock().getTime() + (r.urgent ? 0 : randomInt(this.c.minDelayMs, this.c.maxDelayMs + 1)) });
    }
    this.store.state.seen[id] = true;
    this.store.audit(a ? 'approval_received' : 'message_queued', { id, hash: a?.hash });
    return true;
  }
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const now = this.clock();
      const j = this.store.state.jobs.filter(j => j.status === 'queued' && j.due <= now.getTime() && (j.urgent || workingHours(now))).sort((a, b) => Number(b.urgent) - Number(a.urgent))[0];
      if (!j) return;
      j.status = 'running'; this.store.save();
      try {
        if (j.type === 'discussion') await this.discuss(j);
        else if (j.type === 'announce') await this.announce(j);
        else await this.mutate(j);
        if (j.status === 'running') j.status = 'done';
        this.store.audit('job_result', { id: j.id, status: j.status });
      } catch {
        // External writes may have succeeded even if the response was lost.
        // Never replay automatically. Operator reconciles using audit IDs/markers.
        j.status = 'uncertain'; this.store.audit('job_uncertain', { id: j.id });
      }
    } finally { this.busy = false; }
  }
  async announce(j) {
    const p = this.store.state.proposals[j.hash];
    if (p.status !== 'pending' || digest(p.proposal) !== j.hash) return;
    const v = p.proposal;
    // Verify the cited resources are accessible before presenting an approval request.
    for (const url of v.sources) await this.io.evidence(url);
    const action = v.kind === 'proposal' ? 'approve issue' : 'accept issue';
    const findings = Object.entries(v.findings).map(([k, value]) => `${k}: ${value}`).join('\n\n');
    await this.io.post(j.owner, j.thread, `${v.title}\n\n${v.body}\n\n${findings}\n\nEvidence: ${v.sources.join(' ')}\n\nMark, please reply with “${action} ${j.hash}” if you approve this exact revision.`, j.id);
    p.presented = true; this.store.save();
  }
  async mutate(j) {
    const p = this.store.state.proposals[j.hash];
    if (!p || !p.presented || p.status !== 'approved' || digest(p.proposal) !== j.hash || p.approval.actor !== this.c.ownerId || p.approval.thread !== j.thread) throw Error('Approval mismatch');
    const marker = `<!-- txkpro-team:${j.hash} -->`;
    p.status = 'writing'; this.store.save();
    if (j.type === 'create') {
      const body = `${p.proposal.body}\n\n${Object.entries(p.proposal.findings).map(([k,v]) => `### ${k}\n${v}`).join('\n\n')}\n\nSources: ${p.proposal.sources.join(' ')}\n\nApproved by <@${p.approval.actor}> in Slack message ${p.approval.ts}.\n${marker}`;
      const existing = await this.io.findIssue(marker, p.proposal.title, body);
      p.issue = existing || await this.io.createIssue(p.proposal.title, body);
      p.status = 'created';
    } else {
      await this.io.accept(p.proposal.issue, { hash: j.hash, commit: p.proposal.commit, approval: p.approval, sources: p.proposal.sources }, marker);
      p.status = 'accepted';
      // This records acceptance only. Existing protocol evidence/Project transition
      // validators independently decide whether the issue can be completed.
    }
    this.store.save();
    await this.io.post(j.owner, j.thread, j.type === 'create' ? `I've created the approved issue: https://github.com/${this.c.repository}/issues/${p.issue}.` : `I've recorded your final acceptance for #${p.proposal.issue}. The existing completion checks still apply.`, j.id);
  }
  async discuss(j) {
    const history = this.store.state.jobs.filter(other => other.thread === j.thread && other.type === 'discussion').slice(-10).map(other => ({ text: other.text.slice(0, 1000), notes: other.reviewNotes?.map(n => ({ member: n.member, text: n.text.slice(0, 1000) })) }));
    const context = await this.io.context(j.thread, j.text, history);
    const ids = [...j.reviewers, j.owner].slice(0, 3);
    const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit' }).format(this.clock());
    const used = this.store.state.usage[month] ||= { reserved: 0, actual: 0, requests: [] };
    // UTF-8 byte count is a conservative token ceiling for the bounded textual input.
    const prompt = JSON.stringify({ text: j.text, context, profiles: members });
    const reservation = ids.length * (Buffer.byteLength(prompt) + this.c.maxOutputTokens * 16 + 16000);
    const limit = this.c.monthlyTokens - (j.urgent ? 0 : this.c.incidentReserveTokens);
    if (reservation > this.c.taskTokens || used.reserved + reservation > limit) {
      if (!j.acknowledged) {
        const variants = ["I need a closer look before I can give you a useful answer. I've queued a follow-up.", "I'll need to revisit this when capacity is available. The follow-up is queued.", "I can't give this a thorough review yet. I've kept it queued for follow-up."];
        await this.io.post(j.owner, j.thread, variants[parseInt(digest(j.id).slice(0, 8), 16) % variants.length], j.id + ':capacity');
        j.acknowledged = true;
      }
      j.status = 'queued'; j.due = this.clock().getTime() + 3600000; return;
    }
    used.reserved += reservation; this.store.save();
    const notes = [];
    for (const id of ids) {
      const result = await this.io.generate(id, { request: j.text, context, colleagues: notes }, this.c.maxOutputTokens);
      if (!Number.isSafeInteger(result.usage?.total_tokens) || result.usage.total_tokens < 0) throw Error('Missing usage telemetry');
      used.actual += result.usage.total_tokens;
      used.requests.push({ job: j.id, member: id, usage: result.usage, at: this.clock().toISOString() }); this.store.save();
      notes.push({ member: id, text: result.text });
      // Actual bounded peer contributions are recorded and visible in-thread.
      if (id !== j.owner) await this.io.post(id, j.thread, result.text, j.id + ':' + id);
    }
    const owner = notes.at(-1);
    await this.io.post(j.owner, j.thread, owner.text, j.id + ':owner');
    j.reviewNotes = notes;
  }
}
