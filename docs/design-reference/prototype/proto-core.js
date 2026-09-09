// Core helpers + workflow engine for the Ashniva Desk prototype.
import { ROLES, STATUS, TICKET_STATUS, DEV_CHAIN, CATEGORIES, seed as seedBase } from './proto-data.js';
export { ROLES, STATUS, TICKET_STATUS, DEV_CHAIN, CATEGORIES };
export function seed() { const d = seedBase(); if (seed.augment) seed.augment(d); return d; }

export const MONO = "font-family:'IBM Plex Mono',monospace;";
export const pillStyle = (bg, fg) => `display:inline-flex;align-items:center;height:20px;padding:0 8px;border-radius:10px;font-size:11px;font-weight:500;white-space:nowrap;background:${bg};color:${fg}`;
export const tagStyle = (client) => client ? 'font-size:9.5px;font-weight:600;letter-spacing:.04em;padding:1px 6px;border-radius:3px;background:#e3efe6;color:#1f5a33;white-space:nowrap' : 'font-size:9.5px;font-weight:600;letter-spacing:.04em;padding:1px 6px;border-radius:3px;background:#ececea;color:#4a4b4e;white-space:nowrap';
export function btn(kind, disabled, size) {
  const h = size === 's' ? 'height:26px;padding:0 9px;font-size:11.5px;' : 'height:32px;padding:0 12px;font-size:12.5px;';
  let s = `${h}border-radius:6px;font-weight:500;white-space:nowrap;display:inline-flex;align-items:center;gap:6px;`;
  if (kind === 'primary') s += 'background:var(--p);border:1px solid var(--p);color:#fff;';
  else if (kind === 'good') s += 'background:var(--acc);border:1px solid var(--acc);color:#fff;';
  else if (kind === 'danger') s += 'background:#fff;border:1px solid #d6d6d2;color:#a8321f;';
  else if (kind === 'dark') s += 'background:#1b1c1e;border:1px solid #1b1c1e;color:#fff;';
  else if (kind === 'ghost') s += 'background:none;border:0;color:var(--p);padding:0 4px;';
  else s += 'background:#fff;border:1px solid #d6d6d2;color:#1b1c1e;';
  if (disabled) s += 'opacity:.45;border-style:dashed;cursor:not-allowed;';
  return s;
}
export const priColor = (p) => ({ Critical: '#a8321f', High: '#c2410c', Medium: '#c99a1e', Low: '#9a9b9f' })[p] || '#9a9b9f';
export const dot = (color) => `width:7px;height:7px;border-radius:50%;background:${color};display:inline-block;flex:none`;
export const box = 'background:#fff;border:1px solid #e4e4e0;border-radius:8px;padding:12px 14px;';
export const hrs = (h) => { if (!h) return '0m'; const m = Math.round(h * 60); return (m >= 60 ? Math.floor(m / 60) + 'h ' : '') + (m % 60 ? (m % 60) + 'm' : '').trim() || '0m'; };

export class App {
  constructor(c) { this.c = c; this.hooks = {}; }
  get S() { return this.c.state; }
  get D() { return this.c.state.data; }
  set(patch) { this.c.setState(patch); }
  save() { this.c.setState({ data: this.D }); }
  // ---- lookups
  U(id) { return this.D.users.find(u => u.id === id) || { id, name: id === 'system' ? 'System' : (id || '—'), ini: id === 'system' ? 'SY' : '?', role: 'none' }; }
  P(id) { return this.D.projects.find(p => p.id === id); }
  O(id) { return this.D.orgs.find(o => o.id === id); }
  T(id) { return this.D.tasks.find(t => t.id === id); }
  TK(id) { return this.D.tickets.find(t => t.id === id); }
  R(id) { return this.D.releases.find(r => r.id === id); }
  Q(id) { return this.D.qa.find(q => q.id === id); }
  UAT(id) { return this.D.uat.find(u => u.id === id); }
  C(id) { return this.D.contracts.find(x => x.id === id); }
  get role() { return ROLES.find(r => r.key === this.S.roleKey); }
  get me() { return this.U(this.role.userId); }
  get isClient() { return ['clientadmin', 'clientemployee'].includes(this.S.roleKey); }
  get isMgr() { return ['superadmin', 'pm', 'senior'].includes(this.S.roleKey); }
  get isAdmin() { return this.S.roleKey === 'superadmin'; }
  get isTester() { return this.S.roleKey === 'tester'; }
  get isDev() { return ['developer', 'senior'].includes(this.S.roleKey); }
  get isInternal() { return !this.isClient; }
  name(id) { return this.U(id).name; }
  // ---- time
  now() { const m = this.D.clock; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }
  tick() { this.D.clock += 3; return this.now(); }
  // ---- nav
  go(name, id, extra) { const hist = this.S.hist.slice(-20); hist.push(this.S.page); this.set({ page: Object.assign({ name, id }, extra || {}), hist, modal: null, notifOpen: false }); }
  back() { const hist = this.S.hist.slice(); const prev = hist.pop() || { name: 'dashboard' }; this.set({ page: prev, hist, modal: null }); }
  toast(msg) { this.set({ toast: msg }); clearTimeout(this._tt); this._tt = setTimeout(() => this.set({ toast: '' }), 2600); }
  ui(key, val) { const ui = Object.assign({}, this.S.ui); ui[key] = val; this.set({ ui }); }
  // ---- audit / notify
  audit(type, text) { this.D.audit.unshift({ at: '04/09 ' + this.now(), actor: this.me.id, type, text }); }
  notify(userId, text, page, ref) { if (!userId || userId === this.me.id) return; this.D.notifications.unshift({ id: 'n' + (this.D.counter.notif++), userId, text, at: this.now(), read: false, page, ref }); }
  // ---- modal plumbing
  modal(spec) { const values = {}; (spec.fields || []).concat(spec.moreFields || []).forEach(f => { values[f.key] = f.value === undefined ? (f.type === 'toggle' ? false : '') : f.value; }); this.set({ modal: Object.assign({ values, moreOpen: false }, spec) }); }
  closeModal() { this.set({ modal: null }); }
  val(k) { return this.S.modal ? this.S.modal.values[k] : undefined; }
  setVal(k, v) { const m = Object.assign({}, this.S.modal); m.values = Object.assign({}, m.values, { [k]: v }); this.set({ modal: m }); }
  // ---- workflow engine
  transition(task, to, note, by) {
    const from = task.status; const t = this.tick();
    task.history = task.history || []; task.history.push({ from, to, by: by || this.me.id, at: '04/09 ' + t, note: note || '' });
    task.status = to;
    this.audit('TASK', `${task.id} ${STATUS[from] ? STATUS[from].label : from} → ${STATUS[to].label}${note ? ' — ' + note : ''}`);
    // side effects
    if (to === 'CODE_REVIEW') { if (!task.pr) task.pr = { num: 240 + this.D.counter.task, state: 'Review requested', merged: false, branch: `${task.id}-${task.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 18)}` }; task.checks = { build: 'pass', lint: 'pass', unit: 'pass', api: 'running', security: 'pending', e2e: 'pass' }; this.addMgmtTask(`Review PR #${task.pr.num} — ${task.title}`, 'Review', task.reviewerId, task.projectId, task.id); this.notify(task.reviewerId, `Review requested: PR #${task.pr.num} · ${task.title}`, 'taskDetail', task.id); }
    if (to === 'READY_FOR_QA') { task.pr.state = 'Approved'; task.pr.merged = true; task.staging = true; this.audit('DEPLOY', `Staging deployment success · ${this.P(task.projectId).envs.stagingVersion} · ${task.id}`); this.notify(task.assignedTo, `${task.id} approved and deployed to staging — send for testing`, 'taskDetail', task.id); }
    if (to === 'TESTING_STAGING') { const retest = ['FIX_SUBMITTED', 'RETURNED_TO_DEV'].includes(from); const q = { id: 'QA-' + (this.D.counter.qa++), taskId: task.id, kind: retest ? 'RETEST' : 'QA', testerId: task.testerId, status: 'PENDING', deadline: 'today 17:30', env: 'Staging', whatToTest: task.whatToTest || task.acceptance.join('; ') || task.desc, devNotes: task.devNotes || '', browsers: task.browsers || 'Chrome, Android Chrome', account: task.testAccount || 'Test Customer', grant: { expires: '17:30', revealed: false }, result: null }; this.D.qa.unshift(q); this.notify(task.testerId, `New ${retest ? 'retest' : 'QA'} assignment ${q.id} · ${task.title}`, 'qaDetail', q.id); }
    if (to === 'QA_PASSED') { const p = this.P(task.projectId); if (p.uatRequired && task.clientVisible) { this.transition(task, 'CLIENT_UAT', 'Project requires client UAT', 'system'); } else { this.transition(task, 'READY_TO_PUBLISH', p.uatRequired ? 'Internal task — UAT not needed' : 'UAT not required for this project', 'system'); } return; }
    if (to === 'CLIENT_UAT') { const p = this.P(task.projectId); let u = this.D.uat.find(x => x.status === 'PENDING' && x.orgId === p.orgId && !x.releaseId); if (!u) { u = { id: 'UAT-' + (this.D.counter.uat++), releaseId: null, taskIds: [], orgId: p.orgId, status: 'PENDING', title: 'Please check the completed work', summary: [], checklist: [], respondBy: 'tomorrow 15:00', requestedBy: this.me.id, preview: p.envs.staging, decidedBy: null, note: '' }; this.D.uat.unshift(u); } u.taskIds.push(task.id); u.summary.push(task.clientUpdate || task.title); u.checklist.push(...(task.acceptance.slice(0, 1))); const ca = this.D.users.find(x => x.orgId === p.orgId && x.role === 'clientadmin'); if (ca) this.notify(ca.id, `Work is ready for your approval: ${task.clientUpdate || task.title}`, 'portalApprovals', u.id); }
    if (to === 'QA_FAILED') { this.transition(task, 'RETURNED_TO_DEV', 'Auto-returned with tester reason and evidence', 'system'); this.notify(task.assignedTo, `${task.id} failed QA: ${task.lastFail ? task.lastFail.failure : ''}`, 'taskDetail', task.id); return; }
    if (to === 'PUBLISHED_LIVE') { this.transition(task, 'LIVE_VERIFICATION', 'Live verification assignment created', 'system'); return; }
    if (to === 'COMPLETED') { task.completedAt = '04/09 ' + t; if (task.ticketId) { const tk = this.TK(task.ticketId); if (tk && tk.taskIds.every(id => this.T(id).status === 'COMPLETED')) { tk.status = 'RESOLVED'; tk.resolution = tk.resolution || `Fixed in ${task.title}`; tk.replies.push({ by: this.me.id, at: '04/09 ' + t, body: `Resolved: ${task.clientUpdate || task.title}`, pub: true }); this.notify(tk.requesterId, `Your ticket ${tk.id} has been resolved`, 'portalTicketDetail', tk.id); } } if (task.clientVisible) { const p = this.P(task.projectId); const ca = this.D.users.find(x => x.orgId === p.orgId && x.role === 'clientadmin'); if (ca) this.notify(ca.id, `Completed: ${task.clientUpdate || task.title}`, 'portalHome', null); } }
    if (to === 'LIVE_FAILED') { this.transition(task, 'ROLLBACK_REQUIRED', 'Rollback or hotfix needed', 'system'); this.notify(task.assignedTo, `${task.id} failed live verification — rollback/hotfix required`, 'taskDetail', task.id); return; }
    if (task.ticketId) { const tk = this.TK(task.ticketId); if (tk) { if (['TESTING_STAGING', 'QA_PASSED', 'READY_TO_PUBLISH'].includes(to) && tk.status !== 'REVIEW') tk.status = 'REVIEW'; if (['IN_PROGRESS', 'RETURNED_TO_DEV'].includes(to) && !['RESOLVED', 'CLOSED'].includes(tk.status)) tk.status = 'IN_PROGRESS'; } }
  }
  addMgmtTask(title, category, assignedTo, projectId, linked) { const id = 'AD-' + (this.D.counter.task++); this.D.tasks.unshift({ id, projectId, title, desc: 'Auto-created.', category, kind: 'MGMT', status: 'ASSIGNED', priority: 'High', assignedBy: 'system', assignedTo, reviewerId: null, testerId: null, due: '04/09/2026', est: 0.5, actual: 0, clientVisible: false, clientUpdate: '', ticketId: null, releaseId: null, pr: null, checks: null, staging: false, acceptance: [], comments: [], history: [], linkedTask: linked }); return id; }
  checksOk(task) { const req = this.D.github.requiredChecks; return !!task.checks && req.every(k => task.checks[k] === 'pass') || !!task.checkOverride; }
  checksPending(task) { const req = this.D.github.requiredChecks; return !!task.checks && req.filter(k => task.checks[k] !== 'pass' && task.checks[k] !== 'fail').map(k => k); }
  clientStatus(task) { return STATUS[task.status].client; }
  // ---- permission helpers for a task; returns {ok, reason}
  canAct(task, action) {
    const r = this.S.roleKey, me = this.me.id, isAssignee = task.assignedTo === me, mgr = this.isMgr, st = task.status;
    const no = (reason) => ({ ok: false, reason }); const ok = { ok: true, reason: '' };
    if (this.isClient) return no('Clients cannot change internal tasks');
    switch (action) {
      case 'start': if (!['ASSIGNED', 'RETURNED_TO_DEV', 'ROLLBACK_REQUIRED'].includes(st)) return no(`Not available while ${STATUS[st].label}`); if (!task.assignedTo) return no('Assign the task first'); return isAssignee || mgr ? ok : no('Only the assignee (or a manager) can start this task');
      case 'assign': if (['COMPLETED', 'CANCELLED'].includes(st)) return no('Task is closed'); return mgr || r === 'support' ? ok : no('Only PM, Lead or Admin can assign');
      case 'block': if (['COMPLETED', 'CANCELLED', 'BLOCKED'].includes(st)) return no(st === 'BLOCKED' ? 'Already blocked' : 'Task is closed'); return isAssignee || mgr ? ok : no('Only the assignee or a manager can block');
      case 'unblock': return st === 'BLOCKED' ? (isAssignee || mgr ? ok : no('Only the assignee or a manager')) : no('Task is not blocked');
      case 'devComplete': if (st !== 'IN_PROGRESS' && st !== 'RETURNED_TO_DEV' && st !== 'ROLLBACK_REQUIRED') return no(`Only from In progress (now ${STATUS[st].label})`); return isAssignee ? ok : no('Only the assigned developer can complete their own work');
      case 'mgmtComplete': if (task.kind !== 'MGMT') return no(''); if (st !== 'IN_PROGRESS' && st !== 'ASSIGNED') return no('Already completed'); return isAssignee || mgr ? ok : no('Only the assignee');
      case 'requestReview': if (st !== 'DEV_COMPLETED') return no(`Needs Development completed first (now ${STATUS[st].label})`); return isAssignee || mgr ? ok : no('Only the assignee');
      case 'review': if (st !== 'CODE_REVIEW') return no(`Task is not in code review (now ${STATUS[st].label})`); if (isAssignee) return no('You cannot review your own code'); return (task.reviewerId === me || mgr) ? ok : no('Only the assigned reviewer or a manager can review');
      case 'override': if (st !== 'CODE_REVIEW') return no('Only during code review'); if (this.checksOk(task)) return no('All required checks already pass'); return (r === 'pm' || r === 'senior' || r === 'superadmin') ? ok : no('Only PM, Lead or Admin can override failed checks');
      case 'sendTesting': if (st !== 'READY_FOR_QA') return no(`Task must be Ready for QA (now ${STATUS[st].label})`); if (!task.staging) return no('Staging deployment has not succeeded yet'); return isAssignee || mgr ? ok : no('Only the assignee or a manager');
      case 'test': if (st !== 'TESTING_STAGING') return no(`Not under test (now ${STATUS[st].label})`); return (task.testerId === me || (this.isTester)) ? ok : no('Only the assigned tester can record results');
      case 'uat': if (st !== 'CLIENT_UAT') return no('Not awaiting client approval'); return r === 'clientadmin' ? ok : no('Only the Client Admin can approve UAT');
      case 'addRelease': if (st !== 'READY_TO_PUBLISH') return no(`Only Ready-to-publish tasks can join a release (now ${STATUS[st].label})`); if (task.releaseId) return no(`Already in release ${this.R(task.releaseId).version}`); return mgr ? ok : no('Only PM, Lead or Admin manage releases');
      case 'verifyLive': if (st !== 'LIVE_VERIFICATION') return no('Not published yet'); return this.isTester || this.isAdmin ? ok : no('Only QA verifies production');
      case 'cancel': if (['COMPLETED', 'CANCELLED'].includes(st)) return no('Task is closed'); return mgr ? ok : no('Only PM, Lead or Admin can cancel');
      case 'comment': return ok;
      case 'complete': return no('Completes automatically after live verification passes');
    }
    return no('');
  }
  // ---- ticket permissions
  canTicket(tk, action) {
    const r = this.S.roleKey, me = this.me.id; const no = (reason) => ({ ok: false, reason }); const ok = { ok: true, reason: '' };
    const closed = ['RESOLVED', 'CLOSED', 'CANCELLED'].includes(tk.status);
    switch (action) {
      case 'assign': if (closed) return no('Ticket is closed'); return (this.isMgr || r === 'support') ? ok : no('Only Support, PM, Lead or Admin can assign tickets');
      case 'convert': if (closed) return no('Ticket is closed'); if (this.isClient) return no('Internal action'); return (this.isMgr || r === 'support') ? ok : no('Only Support, PM, Lead or Admin can convert');
      case 'waiting': if (closed || tk.status === 'WAITING_CLIENT') return no(tk.status === 'WAITING_CLIENT' ? 'Already waiting for client' : 'Ticket is closed'); return this.isClient ? no('Internal action') : ok;
      case 'resolve': if (closed) return no('Already resolved'); if (this.isClient) return no('Only the Ashniva team resolves tickets'); if (tk.taskIds.length && !tk.taskIds.every(id => this.T(id).status === 'COMPLETED')) return no(`Linked task ${tk.taskIds.find(id => this.T(id).status !== 'COMPLETED')} is not completed yet`); return ok;
      case 'close': if (tk.status !== 'RESOLVED') return no('Resolve the ticket first'); return (this.isClient && tk.orgId !== this.me.orgId) ? no('Not your ticket') : ok;
      case 'reopen': if (!['RESOLVED', 'CLOSED'].includes(tk.status)) return no('Ticket is still open'); return ok;
      case 'replyPublic': if (tk.status === 'CLOSED') return no('Ticket is closed — reopen to reply'); return ok;
      case 'replyInternal': if (this.isClient) return no('Internal notes are not visible to clients'); return ok;
    }
    return no('');
  }
}
