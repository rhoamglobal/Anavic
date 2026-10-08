import { Client } from 'colyseus.js';
let client: any;
export async function connect(nick: string, code: string, how: string) {
  const url = (import.meta as any).env?.VITE_SERVER_URL || `ws://${location.hostname}:2567`; client = new Client(url);
  const o = { nick, code, kind: how === 'quick' ? 'quick' : 'private' };
  const room = how === 'quick' ? await client.joinOrCreate('match', o) : how === 'create' ? await client.create('match', o) : await client.join('match', o);
  try { sessionStorage.setItem('sfc-token', room.reconnectionToken); } catch { }
  return room;
}
export async function reconnect() { const t = sessionStorage.getItem('sfc-token'); if (!client || !t) throw new Error('no token'); const r = await client.reconnect(t); sessionStorage.setItem('sfc-token', r.reconnectionToken); return r; }
// Server snapshot -> local state. Positions are targets; netTick smooths toward them.
export function applySnap(s: any, m: any) {
  s.time = m.t; s.half = m.h; s.score = m.sc; s.msg = m.m; s.pause = m.pa; s.over = !!m.ov; s.own = m.o; s.nicks = m.n; s.kind = m.k; s.sub = m.u; s.gt = m.gt; s.sc = m.x; s.as = m.y; s.og = m.og; s.mn = m.mn;
  const first = !s.synced; s.synced = true; const b = s.ball;
  b.tx = m.b[0]; b.ty = m.b[1]; b.vx = m.b[2]; b.vy = m.b[3]; b.h = m.b[4];
  m.p.forEach((a: number[], i: number) => { const p = s.ps[i];
    p.tx = a[0]; p.ty = a[1]; p.vx = a[2]; p.vy = a[3]; p.fx = a[4]; p.fy = a[5]; p.stun = a[6] ? .5 : 0; p.sh = !!a[7]; p.run = !!a[8]; p.st = a[9]; p.sl = a[10] & 1 ? .5 : 0; p.kk = a[10] & 2 ? .2 : 0;
    if (first) { p.x = p.tx; p.y = p.ty } });
  if (first) { b.x = b.tx; b.y = b.ty }
}
export function netTick(s: any, dt: number) {
  const k = Math.min(1, dt * 18);
  for (const p of s.ps) { if (p.tx === undefined) continue; p.tx += p.vx * dt; p.ty += p.vy * dt; p.x += (p.tx - p.x) * k; p.y += (p.ty - p.y) * k }
  const b = s.ball; if (b.tx !== undefined) { b.tx += b.vx * dt; b.ty += b.vy * dt; b.x += (b.tx - b.x) * k; b.y += (b.ty - b.y) * k }
}
