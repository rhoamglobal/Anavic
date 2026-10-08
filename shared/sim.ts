// @ts-nocheck
// Shared game simulation. The server runs this for real; the client runs it only offline.
// ===== SHARED SIM (no DOM): moves to /shared/sim.ts for the server in step 3 =====
import {GOALS,FOULS,PENS,MISS} from './data';
const pick=a=>a[Math.random()*a.length|0];
export const W=1000,H=560,GOAL=90,R=15,BR=8;
export const HOME=[[160,.5],[290,.2],[290,.8],[430,.35],[430,.65]]; // no keepers
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function norm(x,y){const m=Math.hypot(x,y)||1;return[x/m,y/m]}
export function mk(o){o=o||{};const ps=[];for(let t=0;t<2;t++)HOME.forEach((h,i)=>{const hx=t?W-h[0]:h[0],hy=h[1]*H;ps.push({t,i,x:hx,y:hy,hx,hy,vx:0,vy:0,fx:t?-1:1,fy:0,cd:0,stun:0,st:1,sh:false,off:false,pk:0,run:false,sl:0,kk:0})});
 const s={ps,ball:{x:W/2,y:H/2,vx:0,vy:0,h:0,vh:0},score:[0,0],half:1,pause:2,over:false,msg:'Kickoff',kind:'info',sub:'',gt:-1,freeze:0,taker:-1,gk:-1,gkT:0,fcd:0,names:o.names||['HOME','AWAY'],mode:o.mode||'match',len:o.len||150,diff:o.diff||1,round:1,me:4,own:-1};
 s.time=s.len;if(s.mode==='shootout'){s.time=8;skpos(s);s.msg='Round 1'}if(s.mode==='training')s.time=1e9;return s}
export function skpos(s){s.ps.forEach((p,k)=>{p.off=!(k===s.me||k===5);p.vx=p.vy=0;p.stun=0;p.cd=0});const m=s.ps[s.me],d=s.ps[5];m.x=W*.58;m.y=H/2+(Math.random()-.5)*220;m.fx=1;m.fy=0;d.x=W-230;d.y=H/2;Object.assign(s.ball,{x:m.x+22,y:m.y,vx:0,vy:0});s.own=s.me}
export function rnd(s,msg,kind){s.round++;if(s.round>5){s.over=true;return}s.time=8;skpos(s);s.msg=msg;s.kind=kind||'info';s.pause=1.6}
export function reset(s){s.own=-1;s.freeze=0;s.gkT=0;s.ps.forEach(p=>{p.x=p.hx;p.y=p.hy;p.vx=p.vy=0;p.stun=0;p.cd=0});Object.assign(s.ball,{x:W/2,y:H/2,vx:0,vy:0,h:0,vh:0})}
export function goal(s,t){s.gt=t;if(s.mode==='shootout'){if(!t)s.score[0]++;return rnd(s,pick(t?MISS:GOALS),t?'info':'goal')}s.score[t]++;s.msg=pick(GOALS);s.kind='goal';s.sub=s.names[t];reset(s);s.pause=2.4}
export function shootDir(p){const[tx,ty]=norm((p.t?0:W)-p.x,H/2-p.y);return norm(p.fx+tx*.6,p.fy+ty*.6)}
export function pickMate(p,s){let best=null,bs=.5;s.ps.forEach(q=>{if(q.t!==p.t||q===p||q.off)return;const d=Math.hypot(q.x-p.x,q.y-p.y),[nx,ny]=norm(q.x-p.x,q.y-p.y),sc=nx*p.fx+ny*p.fy-d/2500;if(sc>bs){bs=sc;best=q}});return best}
// Set pieces: free kick at the foul spot, or a penalty (defender nearest goal stands in as keeper). Everyone else is pushed back and frozen briefly.
export function setPiece(s,type,ko){const q=s.ps[ko],t=q.t,d=t?-1:1,gx=t?0:W,pen=type==='pen',b=s.ball;
 const bx=pen?gx-d*140:clamp(q.x,40,W-40),by=pen?H/2:clamp(q.y,40,H-40);
 Object.assign(b,{x:bx,y:by,vx:0,vy:0,h:0,vh:0});q.x=clamp(bx-d*26,R,W-R);q.y=by;q.vx=q.vy=0;q.fx=d;q.fy=0;s.own=ko;s.taker=ko;s.gk=-1;
 if(pen){let bi=-1,bd=1e9;s.ps.forEach((p,k)=>{if(p.t!==t&&!p.off){const dd=Math.abs(p.x-gx);if(dd<bd){bd=dd;bi=k}}});s.gk=bi;if(bi>=0){const g=s.ps[bi];g.x=gx-d*14;g.y=H/2;g.vx=g.vy=0}s.gkT=4}
 s.ps.forEach((p,k)=>{if(k===ko||k===s.gk||p.off)return;const dx=p.x-bx,dy=p.y-by,m=Math.hypot(dx,dy)||1,mn=pen?220:130;if(m<mn){p.x=clamp(bx+dx/m*mn,R,W-R);p.y=clamp(by+dy/m*mn,R,H-R)}});
 s.pause=2.2;s.freeze=1.6;s.fcd=8}
export function callFoul(s,fk,fouled){const o=s.ps[fouled],gx=o.t?0:W,box=Math.abs(o.x-gx)<170&&Math.abs(o.y-H/2)<150;
 s.kind=box?'pen':'foul';s.msg=pick(box?PENS:FOULS);s.sub=(box?'PENALTY - ':'FREE KICK - ')+s.names[o.t];setPiece(s,box?'pen':'fk',fouled)}
export function step(s,inp,dt){
 if(s.over)return;
 if(s.pause>0){s.pause-=dt;if(s.pause<=0)s.msg='';return}
 s.time-=dt;if(s.freeze>0)s.freeze-=dt;if(s.gkT>0)s.gkT-=dt;s.fcd=Math.max(0,s.fcd-dt);
 if(s.time<=0){if(s.mode==='shootout')return rnd(s,pick(MISS),'info');if(s.half===1){s.half=2;s.time=s.len;s.msg='Half time';reset(s);s.pause=2.5}else{s.time=0;s.over=true}return}
 const b=s.ball;
 s.ps.forEach((p,k)=>{if(p.off)return;p.sl=Math.max(0,p.sl-dt);p.kk=Math.max(0,p.kk-dt);if(s.freeze>0&&k!==s.taker&&k!==s.gk){p.vx=p.vy=0;return}const u=inp[k];p.cd=Math.max(0,p.cd-dt);p.pk=Math.max(0,p.pk-dt);p.stun=Math.max(0,p.stun-dt);
  let mx=u.mx,my=u.my;let m=Math.hypot(mx,my);if(m>1){mx/=m;my/=m}if(u.press&&s.own>=0&&s.ps[s.own].t!==p.t){const c=s.ps[s.own],[ex,ey]=norm(c.x-p.x,c.y-p.y);mx=ex*.8+mx*.4;my=ey*.8+my*.4;m=Math.hypot(mx,my);if(m>1){mx/=m;my/=m}} // press: auto-close the carrier
  const run=!!(u.sprint&&p.st>.05&&m>.2),has=s.own===k;p.run=run;p.st=clamp(p.st+(run?-.35:.12)*dt,0,1);p.sh=!!u.shield;
  const sp=(run?250:u.press?215:180)*(has?.93:1)*(p.t?s.diff:1)*(p.stun>0?.3:1)*(u.shield?.55:1),a=Math.min(1,dt*(has?7:10));
  p.vx+=(mx*sp-p.vx)*a;p.vy+=(my*sp-p.vy)*a;if(m>.2){p.fx=mx/m;p.fy=my/m}
  p.x=clamp(p.x+p.vx*dt,R,W-R);p.y=clamp(p.y+p.vy*dt,R,H-R);
  const d=Math.hypot(b.x-p.x,b.y-p.y);
  if(p.stun<=0&&p.cd<=0){
   const act=u.shoot?1:u.pass?3:u.lob?4:u.thru?5:0;
   if((has||d<R+BR+10)&&act){let ax,ay,pw;
    if(act===1){[ax,ay]=shootDir(p);const e=(Math.random()-.5)*(run?.16:.08)*(1+u.shoot*.8),c=Math.cos(e),sn=Math.sin(e);[ax,ay]=[ax*c-ay*sn,ax*sn+ay*c];pw=480+470*u.shoot}
    else{const t=u.to||pickMate(p,s);let X,Y;if(t){const l=act===5?.9:act===4?.5:.3;X=t.x+t.vx*l;Y=t.y+t.vy*l;if(act===5&&Math.hypot(t.vx,t.vy)<30)X+=(p.t?-1:1)*70}else{X=p.x+p.fx*160;Y=p.y+p.fy*160}
     const dd=Math.hypot(X-p.x,Y-p.y);[ax,ay]=norm(X-p.x,Y-p.y);pw=act===3?clamp(dd*2.4,300,500):act===5?clamp(dd*2.6,380,640):clamp(dd*2.8,420,760);if(act===4)b.vh=Math.min(300,150+dd*.6)}
    b.vx=ax*pw;b.vy=ay*pw;p.cd=.4;p.pk=.35;p.kk=.25;s.own=-1}
   else if(u.skill){p.cd=1.2;p.vx+=p.fx*320;p.vy+=p.fy*320;if(has){s.own=-1;p.pk=.12;b.vx=p.fx*360;b.vy=p.fy*360}}
   else if(u.slide){p.cd=1.1;p.sl=.5;p.vx+=p.fx*430;p.vy+=p.fy*430;const o=s.own>=0?s.ps[s.own]:null; // slide: long reach, risky, can be a foul
    if(o&&o.t!==p.t&&Math.hypot(o.x-p.x,o.y-p.y)<2*R+48){const won=Math.random()<(o.sh?.3:.75);if(s.mode==='match'&&s.fcd<=0&&Math.random()<(won?.1:.5)){p.stun=.8;callFoul(s,k,s.own);return}if(won){s.own=k;o.stun=.5;o.pk=.6;p.pk=0}else p.stun=.6}else p.stun=.6}
   else if(u.tackle){p.cd=.7;p.vx+=p.fx*240;p.vy+=p.fy*240;const o=s.own>=0?s.ps[s.own]:null;
    if(o&&o.t!==p.t){if(Math.hypot(o.x-p.x,o.y-p.y)<2*R+24){const behind=p.fx*o.fx+p.fy*o.fy>.6,blk=Math.random()<(o.sh?.7:.12);
      if(s.mode==='match'&&s.fcd<=0&&Math.random()<(blk?.05:behind?.1:.012)){p.stun=.8;callFoul(s,k,s.own);return}
      if(blk)p.stun=.4;else{s.own=k;o.stun=.45;o.pk=.6;p.pk=0}}}
    else if(!o&&b.h<20&&d<R+BR+26){s.own=k}} // poke a loose ball

  }
 });
 for(let i=0;i<10;i++)for(let j=i+1;j<10;j++){const a=s.ps[i],c=s.ps[j];if(a.off||c.off)continue;let dx=c.x-a.x,dy=c.y-a.y;const d=Math.hypot(dx,dy);if(d>0&&d<2*R){const o=(2*R-d)/2;dx/=d;dy/=d;a.x-=dx*o;a.y-=dy*o;c.x+=dx*o;c.y+=dy*o}}
 // possession: the ball sticks to the carrier's feet, leads further when sprinting
 if(s.own>=0){const o=s.ps[s.own];if(o.off||o.stun>0)s.own=-1;else{const lead=R+BR+(o.run?9:3),k2=Math.min(1,dt*16);b.x+=(o.x+o.fx*lead-b.x)*k2;b.y+=(o.y+o.fy*lead-b.y)*k2;b.vx=o.vx;b.vy=o.vy;b.h=b.vh=0}}
 if(s.own<0&&(b.h>0||b.vh>0)){b.vh-=720*dt;b.h+=b.vh*dt;if(b.h<=0){b.h=0;b.vh=b.vh<-140?-b.vh*.3:0}}
 if(s.own<0){const bs=Math.hypot(b.vx,b.vy);let bi=-1,bd=1e9;
  s.ps.forEach((p,k)=>{if(p.off||p.pk>0||p.stun>0)return;const d=Math.hypot(b.x-p.x,b.y-p.y);if(b.h<24&&d<R+BR+8&&d<bd){bd=d;bi=k}});
  if(bi>=0&&bs<520)s.own=bi;
  else s.ps.forEach(p=>{if(p.off)return;const dx=b.x-p.x,dy=b.y-p.y,d=Math.hypot(dx,dy)||1;if(d<R+BR&&b.h<24){const nx=dx/d,ny=dy/d;b.x=p.x+nx*(R+BR);b.y=p.y+ny*(R+BR);const rel=(b.vx-p.vx)*nx+(b.vy-p.vy)*ny;if(rel<0){b.vx-=rel*nx*1.3;b.vy-=rel*ny*1.3}}});
  b.x+=b.vx*dt;b.y+=b.vy*dt;const f=Math.pow(.3,dt);b.vx*=f;b.vy*=f}
 if(b.y<BR){b.y=BR;b.vy*=-.8}if(b.y>H-BR){b.y=H-BR;b.vy*=-.8}
 const gy=Math.abs(b.y-H/2)<GOAL/2;
 if(b.x<BR){if(gy){if(b.x<-4)return goal(s,1)}else{b.x=BR;b.vx*=-.8}}
 if(b.x>W-BR){if(gy){if(b.x>W+4)return goal(s,0)}else{b.x=W-BR;b.vx*=-.8}}
}
export const NOACT={mx:0,my:0,sprint:0,press:0,slide:0,pass:0,lob:0,thru:0,shoot:0,shield:0,skill:0,tackle:0};
// AI: attackers dribble, dodge, pass to free runners and shoot; defenders press, cover and mark goal-side
export function ai(s,k){const p=s.ps[k],b=s.ball,u={...NOACT},d=p.t?-1:1,gx=p.t?0:W,ogx=p.t?W:0;
 const mates=s.ps.filter(q=>q.t===p.t&&!q.off),opps=s.ps.filter(q=>q.t!==p.t&&!q.off),car=s.own>=0?s.ps[s.own]:null;
 const dist=(a,x,y)=>Math.hypot(a.x-x,a.y-y),by=(x,y)=>mates.slice().sort((a,c)=>dist(a,x,y)-dist(c,x,y));let tx=p.hx,ty=p.hy;
 if(s.gk===k&&s.gkT>0){tx=ogx+d*14;ty=clamp(b.y,H/2-GOAL/2+8,H/2+GOAL/2-8);if(dist(p,b.x,b.y)<45){tx=b.x;ty=b.y}}
 else if(car===p){const dg=dist(p,gx,H/2);let o=opps[0];opps.forEach(c=>{if(dist(c,p.x,p.y)<dist(o,p.x,p.y))o=c});const near=o?dist(o,p.x,p.y):1e9;
  tx=gx;ty=H/2+(p.y<H/2?-30:30);if(near<90){ty=p.y+(p.y>o.y?90:-90);tx=p.x+d*50}
  u.sprint=near>80?1:0;if(dg<360&&(near>45||dg<200||Math.random()<.04))u.shoot=.6;
  const free=mates.filter(q=>q!==p&&(q.x-p.x)*d>-20&&dist(q,p.x,p.y)>90&&dist(q,p.x,p.y)<380&&opps.every(c=>dist(c,q.x,q.y)>60)).sort((a,c)=>(c.x-a.x)*d);
  if(free.length&&near<75&&Math.random()<.05){u.pass=1;u.to=free[0]}}
 else if(car&&car.t===p.t){tx=clamp(p.hx+(car.x-W/2)*.55+d*70,60,W-60);ty=clamp(p.hy+(car.y-H/2)*.35,40,H-40);u.sprint=dist(p,tx,ty)>120?1:0}
 else if(car){const rank=by(car.x,car.y).indexOf(p);
  if(rank===0){tx=car.x;ty=car.y;const dc=dist(p,car.x,car.y);u.sprint=dc>60?1:0;if(dc<2*R+12&&Math.random()<.035)u.tackle=1}
  else if(rank===1){tx=car.x+(ogx-car.x)*.3;ty=car.y+(H/2-car.y)*.3}
  else{const ms=opps.filter(o=>o!==car),o=ms[p.i%ms.length]||car;tx=o.x+(ogx-o.x)*.25;ty=o.y+(H/2-o.y)*.1}}
 else{if(by(b.x,b.y)[0]===p){tx=b.x;ty=b.y;u.sprint=dist(p,b.x,b.y)>60?1:0}else{tx=p.hx+(b.x-W/2)*.4;ty=p.hy+(b.y-H/2)*.3}}
 const dx=tx-p.x,dy=ty-p.y,dd=Math.hypot(dx,dy);if(dd>8){u.mx=dx/dd;u.my=dy/dd}return u}
