import { Server, Room, Client } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { mk, step, ai, NOACT } from '../shared/sim';
import { TEAMS, FIELDS } from '../shared/data';

// Authoritative match room. Clients send INPUTS only. Setup flow:
//  - humans on one side only: that side's captain (first to join) picks stadium + both kits
//  - humans on both sides: captain of side A calls heads/tails, the winner's captain picks the stadium, each captain picks their own kit
class MatchRoom extends Room {
  maxClients = 10;
  s: any; slots = new Map<string, number>(); order: string[] = []; ready = new Set<string>();
  held: any[] = []; latch: any[] = []; nicks: string[] = Array(10).fill(''); overAt = 0; code = 'PUBLIC';
  cfg: any = { phase: 'setup', field: 'street', teams: [0, 2], caps: [-1, -1], chooser: -1, caller: -1, toss: null };
  names() { return this.cfg.teams.map((i: number) => TEAMS[i].sh); }
  captain(side: number) { for (const id of this.order) { const k = this.slots.get(id); if (k !== undefined && (k < 5 ? 0 : 1) === side) return k; } return -1; }
  pub() { for (const c of this.clients) if (this.ready.has(c.sessionId)) c.send('cfg', { ...this.cfg, code: this.code }); }
  reconf() {
    const c = this.cfg; if (c.phase !== 'play') {
      const a = this.captain(0), b = this.captain(1); c.caps = [a, b];
      if (a >= 0 && b >= 0) { if (!c.toss) { c.phase = 'toss'; c.caller = a; } else { c.phase = 'setup'; c.chooser = c.toss.winner === 0 ? a : b; } }
      else { c.phase = 'setup'; c.toss = null; c.caller = -1; c.chooser = Math.max(a, b); }
    }
    this.pub();
  }
  onCreate(o: any) {
    this.code = String(o.code || 'PUBLIC'); this.setMetadata({ code: this.code });
    this.s = mk({ len: 150, names: this.names() });
    for (let i = 0; i < 10; i++) { this.held[i] = {}; this.latch[i] = {}; }
    this.onMessage('ready', (c) => { this.ready.add(c.sessionId); c.send('you', { idx: this.slots.get(c.sessionId) }); this.pub(); });
    this.onMessage('in', (c, m) => {
      const k = this.slots.get(c.sessionId); if (k === undefined || !m) return;
      const n = (v: any) => Math.max(-1, Math.min(1, Number(v) || 0));
      this.held[k] = { mx: n(m.mx), my: n(m.my), sprint: m.sprint ? 1 : 0, shield: m.shield ? 1 : 0, press: m.press ? 1 : 0 };
      for (const a of ['pass', 'lob', 'thru', 'tackle', 'slide', 'skill']) if (m[a]) this.latch[k][a] = 1;
      if (m.shoot) this.latch[k].shoot = Math.max(0.4, Math.min(1, Number(m.shoot) || 0.4));
    });
    this.onMessage('call', (c, m) => { // heads/tails: caller wins if the coin matches, otherwise the other captain
      const k = this.slots.get(c.sessionId), g = this.cfg; if (g.phase !== 'toss' || k !== g.caller || !['H', 'T'].includes(m?.c)) return;
      const result = Math.random() < .5 ? 'H' : 'T', side = k < 5 ? 0 : 1;
      g.toss = { call: m.c, result, winner: m.c === result ? side : 1 - side }; this.reconf();
    });
    this.onMessage('cfg', (c, m) => {
      const k = this.slots.get(c.sessionId), g = this.cfg; if (k === undefined || g.phase === 'play') return;
      if (m?.field && k === g.chooser && FIELDS.some(f => f.id === m.field)) g.field = m.field;
      const both = g.caps[0] >= 0 && g.caps[1] >= 0, tm = Number(m?.team);
      const side = both ? (k === g.caps[0] ? 0 : k === g.caps[1] ? 1 : -1) : (k === g.chooser ? Number(m?.side) : -1);
      if ((side === 0 || side === 1) && Number.isInteger(tm) && TEAMS[tm]) g.teams[side] = tm;
      this.pub();
    });
    this.onMessage('start', (c) => { const k = this.slots.get(c.sessionId), g = this.cfg; if (g.phase !== 'setup' || k !== g.chooser) return; g.phase = 'play'; this.s = mk({ len: 150, names: this.names() }); this.pub(); });
    let acc = 0, snap = 0;
    this.setSimulationInterval((ms) => {
      if (!this.slots.size || this.cfg.phase !== 'play') return;
      acc += Math.min(ms, 100) / 1000; snap += ms;
      while (acc >= 1 / 60) { this.tick(); acc -= 1 / 60; }
      if (snap >= 50) { snap = 0; this.broadcast('s', this.snap()); }
    }, 1000 / 60);
  }
  tick() {
    const s = this.s, hum = new Set(this.slots.values());
    if (s.over) { if (!this.overAt) this.overAt = Date.now(); else if (Date.now() - this.overAt > 6000) { this.s = mk({ len: 150, names: this.names() }); this.overAt = 0; } return; }
    const inp = s.ps.map((p: any, k: number) => hum.has(k) ? { ...NOACT, ...this.held[k], ...this.latch[k] } : ai(s, k)); // empty slots = AI
    step(s, inp, 1 / 60);
    for (const k of hum) this.latch[k] = {};
  }
  onJoin(c: Client, o: any) {
    const cnt = [0, 0]; for (const k of this.slots.values()) cnt[k < 5 ? 0 : 1]++;
    const t = cnt[0] <= cnt[1] ? 0 : 1, taken = new Set(this.slots.values());
    const k = t * 5 + [4, 3, 2, 1, 0].find(i => !taken.has(t * 5 + i))!;
    this.slots.set(c.sessionId, k); this.order.push(c.sessionId); this.held[k] = {}; this.latch[k] = {};
    this.nicks[k] = String(o?.nick || 'PLAYER').replace(/[^\w ]/g, '').slice(0, 14).toUpperCase();
    this.reconf();
  }
  onLeave(c: Client) {
    const k = this.slots.get(c.sessionId); this.slots.delete(c.sessionId); this.ready.delete(c.sessionId); this.order = this.order.filter(x => x !== c.sessionId);
    if (k !== undefined) this.nicks[k] = ''; this.reconf();
  }
  snap() {
    const s = this.s, r = (v: number) => Math.round(v * 10) / 10;
    return { t: r(s.time), h: s.half, sc: s.score, m: s.msg, k: s.kind, u: s.sub, gt: s.gt, pa: s.pause > 0 ? 1 : 0, ov: s.over ? 1 : 0, o: s.own,
      b: [r(s.ball.x), r(s.ball.y), r(s.ball.vx), r(s.ball.vy), r(s.ball.h)],
      p: s.ps.map((p: any) => [r(p.x), r(p.y), r(p.vx), r(p.vy), +p.fx.toFixed(2), +p.fy.toFixed(2), p.stun > 0 ? 1 : 0, p.sh ? 1 : 0, p.run ? 1 : 0, +p.st.toFixed(2), (p.sl > 0 ? 1 : 0) + (p.kk > 0 ? 2 : 0)]), n: this.nicks };
  }
}
const server = new Server({ transport: new WebSocketTransport() });
server.define('match', MatchRoom).filterBy(['code']);
server.listen(Number(process.env.PORT) || 2567).then(() => console.log('Gbam server listening on :' + (process.env.PORT || 2567)));
