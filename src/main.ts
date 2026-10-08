// @ts-nocheck
import * as THREE from 'three';
import './style.css';
import {W,H,GOAL,R,BR,clamp,mk,step,ai,NOACT,summary} from '../shared/sim';
import {connect,reconnect,applySnap,netTick} from './net';
import {TEAMS,FIELDS} from '../shared/data';
import {sfxKick,sfxWhistle,sfxGoal,sfxSlide,sfxTap,toggleMute,isMuted} from './audio';
// ===== 3D RENDER (Three.js): sim x,y -> world x,z at 0.1 scale =====
const $=id=>document.getElementById(id),K=.1;
const ren=new THREE.WebGLRenderer({canvas:$('gl'),antialias:true});ren.setPixelRatio(Math.min(devicePixelRatio||1,2));ren.outputEncoding=THREE.sRGBEncoding;
const scene=new THREE.Scene();scene.background=new THREE.Color(0x9fd0ee);scene.fog=new THREE.Fog(0x9fd0ee,80,190);
const cam=new THREE.PerspectiveCamera(45,1,.5,300);
scene.add(new THREE.HemisphereLight(0xffffff,0xb89a6a,.95));const dl=new THREE.DirectionalLight(0xfff0d0,.6);dl.position.set(-20,40,20);scene.add(dl);
const mat=c=>new THREE.MeshLambertMaterial({color:c});
const box=(w,h,d,c,x,y,z)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(c));m.position.set(x,y,z);scene.add(m);return m};
function pitchTex(){const c=document.createElement('canvas');c.width=2000;c.height=1120;const g=c.getContext('2d'),r=Math.random;
 g.fillStyle='#b9ae9b';g.fillRect(0,0,2000,1120);
 for(let i=0;i<900;i++){g.fillStyle=`rgba(${r()<.5?'90,80,65':'230,220,200'},.12)`;g.fillRect(r()*2000,r()*1120,4+r()*14,3+r()*8)}
 g.fillStyle='rgba(224,178,58,.55)';[[420,300,230,130],[1500,820,260,140],[900,900,150,90]].forEach(e=>{g.beginPath();g.ellipse(e[0],e[1],e[2],e[3],.3,0,7);g.fill()});
 g.fillStyle='rgba(62,154,78,.6)';g.beginPath();g.moveTo(1180,380);g.lineTo(1420,340);g.lineTo(1520,480);g.lineTo(1400,640);g.lineTo(1260,600);g.closePath();g.fill();
 g.fillStyle='rgba(210,70,60,.5)';g.beginPath();g.ellipse(1330,500,60,45,0,0,7);g.fill();
 g.strokeStyle='rgba(60,50,40,.35)';g.lineWidth=3;for(let i=0;i<26;i++){g.beginPath();let x=r()*2000,y=r()*1120;g.moveTo(x,y);for(let j=0;j<6;j++){x+=(r()-.5)*160;y+=(r()-.5)*160;g.lineTo(x,y)}g.stroke()}
 g.strokeStyle='rgba(255,255,255,.9)';g.lineWidth=8;g.strokeRect(4,4,1992,1112);g.beginPath();g.moveTo(1000,0);g.lineTo(1000,1120);g.stroke();
 g.beginPath();g.arc(1000,560,140,0,7);g.stroke();g.strokeRect(4,300,260,520);g.strokeRect(1736,300,260,520);
 const t=new THREE.CanvasTexture(c);t.anisotropy=4;t.encoding=THREE.sRGBEncoding;return t}
// ===== FIELDS: street court / dust pitch / synthetic arena (rebuilt on demand) =====
const env=new THREE.Group();scene.add(env);
const add=(o,x,y,z)=>{o.position.set(x,y,z);env.add(o);return o};
const bx=(w,h,d,c,x,y,z)=>add(new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(c)),x,y,z);
const LINES=g=>{g.strokeStyle='rgba(255,255,255,.92)';g.lineWidth=8;g.strokeRect(4,4,1992,1112);g.beginPath();g.moveTo(1000,0);g.lineTo(1000,1120);g.stroke();g.beginPath();g.arc(1000,560,140,0,7);g.stroke();g.strokeRect(4,300,260,520);g.strokeRect(1736,300,260,520)};
function texOf(kind){const c=document.createElement('canvas');c.width=2000;c.height=1120;const g=c.getContext('2d'),r=Math.random;
 if(kind==='arena'){for(let i=0;i<10;i++){g.fillStyle=i%2?'#2f9d4d':'#38ab58';g.fillRect(i*200,0,200,1120)}for(let i=0;i<1800;i++){g.fillStyle='rgba(0,0,0,.05)';g.fillRect(r()*2000,r()*1120,3,7)}}
 else{g.fillStyle='#b9824f';g.fillRect(0,0,2000,1120);for(let i=0;i<1400;i++){g.fillStyle=`rgba(${r()<.5?'120,70,35':'235,190,140'},.13)`;g.beginPath();g.ellipse(r()*2000,r()*1120,6+r()*34,4+r()*16,r(),0,7);g.fill()}
  g.fillStyle='rgba(90,55,30,.25)';for(let i=0;i<9;i++){g.beginPath();g.ellipse(r()*2000,r()*1120,60+r()*80,30+r()*40,r(),0,7);g.fill()}}
 LINES(g);const t=new THREE.CanvasTexture(c);t.anisotropy=4;t.encoding=THREE.sRGBEncoding;return t}
const FLD={street:{sky:0x9fd0ee,gnd:0xc9a56d,tex:()=>pitchTex()},dust:{sky:0xf0b27a,gnd:0xb9824f,tex:()=>texOf('dust')},arena:{sky:0x16224a,gnd:0x1c2b45,tex:()=>texOf('arena')}};
const PAL=[0xe86f9a,0xf2c14e,0x5ec4b6,0xf4a259,0x8ecae6,0xe9a6c7,0xb7d968],AWN=[0xd62828,0x2a9d4f,0xf77f00,0x1d6fd6,0xf5c518];
function buildField(id){const f=FLD[id]||FLD.street;while(env.children.length)env.remove(env.children[0]);scene.background.set(f.sky);scene.fog.color.set(f.sky);
 add(new THREE.Mesh(new THREE.PlaneGeometry(W*K,H*K),new THREE.MeshBasicMaterial({map:f.tex()})),0,0,0).rotation.x=-Math.PI/2;
 add(new THREE.Mesh(new THREE.PlaneGeometry(500,500),mat(f.gnd)),0,-.03,0).rotation.x=-Math.PI/2;
 const crowd=(n,x0,x1,z0,z1,y)=>{const im=new THREE.InstancedMesh(new THREE.CylinderGeometry(.45,.45,2,6),new THREE.MeshLambertMaterial({color:0xffffff}),n),M=new THREE.Matrix4(),C=new THREE.Color();for(let i=0;i<n;i++){M.setPosition(x0+Math.random()*(x1-x0),y,z0+Math.random()*(z1-z0));im.setMatrixAt(i,M);im.setColorAt(i,C.setHSL(Math.random(),.65,.55))}env.add(im)};
 if(id==='arena'){for(let i=0;i<5;i++){bx(112,1.2,3,i%2?0x2b3a67:0x233057,0,.6+i*1.2,-33-i*3);crowd(26,-52,52,-33-i*3,-33-i*3,1.2*i+1.8)}
  for(let i=0;i<10;i++){const c=[0xff2e88,0x2a6fdb,0xc6ff3d,0xf6c90e,0xffffff][i%5];bx(10,1.5,.3,c,-45+i*10,.75,-29.5);bx(10,1.5,.3,c,-45+i*10,.75,29.5)}
  [-1,1].forEach(sx=>[-26,26].forEach(z=>{bx(.5,18,.5,0x888888,sx*54,9,z);bx(4,1,1,0xfff6c4,sx*54,18.2,z)}))}
 else if(id==='dust'){bx(130,5,1,0xc9a173,0,2.5,-33);for(let i=0;i<9;i++){const x=-60+i*15;bx(9,6+(i%3),6,[0xd9b38c,0xc79a6c,0xe5c9a5][i%3],x,3.5,-39);bx(10,.4,7,0x8b4b2a,x,7,-39)}
  [-48,-30,-12,16,38,54].forEach(x=>{add(new THREE.Mesh(new THREE.CylinderGeometry(.3,.45,8,6),mat(0x6b4a2b)),x,4,-31);for(let j=0;j<5;j++){const l=add(new THREE.Mesh(new THREE.ConeGeometry(.6,5,4),mat(0x2f7d32)),x+Math.cos(j*1.26)*2,8.5,-31+Math.sin(j*1.26)*2);l.rotation.z=Math.cos(j*1.26)*1.2;l.rotation.x=Math.sin(j*1.26)*1.2}});crowd(36,-45,45,-35.5,-35.5,1.2)}
 else{bx(W*K+8,.5,.8,0xf5c518,0,.25,-H*K/2-.6);
  for(let x=-80,i=0;x<80;i++){const w=11+(i*7%6),h=14+(i*5%9);bx(w,h,8,PAL[i%7],x+w/2,h/2,-46);bx(w-1.5,.35,3.2,AWN[i%5],x+w/2,7,-41.6);bx(2.4,4.5,.3,0x2b2118,x+w/2,2.3,-41.9);x+=w+.4}
  crowd(80,-55,55,-37,-33.5,1.2);add(new THREE.Mesh(new THREE.PlaneGeometry(W*K+8,3.2,70,4),new THREE.MeshBasicMaterial({color:0x444444,wireframe:true})),0,1.6,H*K/2+1.5)}
 const wc=id==='street'?[0xe07a1f,0x2f8f6a]:id==='dust'?[0xb08a5e,0xa07a50]:[0x1a2a55,0x1a2a55];
 [-1,1].forEach((sd,i)=>{bx(1,id==='arena'?3:5,H*K+4,wc[i],sd*(W*K/2+3.4),id==='arena'?1.5:2.5,0);[-1,1].forEach(g=>bx(.35,4,.35,0xffffff,sd*W*K/2,2,g*GOAL*K/2));bx(.35,.35,GOAL*K+.35,0xffffff,sd*W*K/2,4,0);
  add(new THREE.Mesh(new THREE.BoxGeometry(2.6,4,GOAL*K),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.14})),sd*(W*K/2+1.3),2,0)})}
// players: low-poly rig (swap for GLB models later)
const SK=[0x8d5524,0x5c3a21,0x3b2314,0xa86b3c,0x6f4426];
const shMat=new THREE.MeshBasicMaterial({color:0,transparent:true,opacity:.3}),shGeo=new THREE.CircleGeometry(1,16);
function blob(sc){const m=new THREE.Mesh(shGeo,shMat);m.rotation.x=-Math.PI/2;m.position.y=.04;m.scale.set(sc,sc,1);scene.add(m);return m}
let s=mk(),me=4,nick='ODOGWU',inMenu=true;let lob:any=null,online:any=null,lastIn='',lastSend=0;
const HAIR=[0x111111,0x1a1008,0x2b1b10,0x111111,0x3b2314],NUMS=[4,8,7,11,9];
const numTex=n=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');g.font='900 44px Impact,Arial';g.textAlign='center';g.fillStyle='#fff';g.strokeStyle='rgba(0,0,0,.5)';g.lineWidth=4;g.strokeText(n,32,50);g.fillText(n,32,50);return new THREE.CanvasTexture(c)};
const rigs=s.ps.map((p,k)=>{const g=new THREE.Group(),m={shirt:mat(0xffffff),short:mat(0x222222),sock:mat(0xffffff),skin:mat(SK[k%5]),hair:mat(HAIR[k%5]),boot:mat(0x111111)};
 const legs=[-.32,.32].map(ox=>{const l=new THREE.Group();l.position.set(ox,1.45,0);const th=new THREE.Mesh(new THREE.BoxGeometry(.5,.7,.5),m.short),sh=new THREE.Mesh(new THREE.BoxGeometry(.42,.55,.42),m.sock),bt=new THREE.Mesh(new THREE.BoxGeometry(.46,.22,.7),m.boot);th.position.y=-.35;sh.position.y=-.95;bt.position.set(0,-1.32,.1);l.add(th,sh,bt);g.add(l);return l});
 const body=new THREE.Group();body.position.y=1.45;g.add(body);
 const tor=new THREE.Mesh(new THREE.CylinderGeometry(.66,.55,1.3,10),m.shirt);tor.position.y=.62;const sh2=new THREE.Mesh(new THREE.CylinderGeometry(.56,.6,.4,10),m.short);sh2.position.y=-.1;
 const hd=new THREE.Mesh(new THREE.SphereGeometry(.5,10,8),m.skin);hd.position.y=1.72;
 const hs=k%3,hr=hs===2?new THREE.Mesh(new THREE.SphereGeometry(.6,8,6),m.hair):new THREE.Mesh(new THREE.SphereGeometry(.53,8,6,0,6.3,0,hs?1.2:1.5),m.hair);hr.position.y=hs===2?1.85:1.76;
 const num=new THREE.Mesh(new THREE.PlaneGeometry(.7,.7),new THREE.MeshBasicMaterial({map:numTex(NUMS[p.i]),transparent:true}));num.position.set(0,.7,-.57);num.rotation.y=Math.PI;
 const arms=[-1,1].map(sd=>{const a=new THREE.Group();a.position.set(sd*.8,1.15,0);const sl=new THREE.Mesh(new THREE.BoxGeometry(.3,.4,.3),m.shirt),ar=new THREE.Mesh(new THREE.BoxGeometry(.26,.6,.26),m.skin);sl.position.y=-.15;ar.position.y=-.6;a.add(sl,ar);body.add(a);return a});
 body.add(tor,sh2,hd,hr,num);scene.add(g);return{g,legs,arms,body,m,sh:blob(1.1),ph:0,ang:0}});
// kits: shirt colour clashes are resolved by giving the second team its away shirt
const hex=c=>'#'+c.toString(16).padStart(6,'0'),far=(a,b)=>Math.hypot((a>>16)-(b>>16),((a>>8)&255)-((b>>8)&255),(a&255)-(b&255))>120;
const shirts=t=>{const a=TEAMS[t[0]],b=TEAMS[t[1]];return[a.c,far(a.c,b.c)?b.c:b.a]};
function kit(t){const sc=shirts(t);s.ps.forEach((p,k)=>{const T=TEAMS[t[p.t]],q=rigs[k].m,away=p.t&&sc[1]===T.a;q.shirt.color.setHex(sc[p.t]);q.short.color.setHex(away?T.c:T.s);q.sock.color.setHex(away?T.c:T.k)})}
function board(t){const sc=shirts(t),lum=c=>(c>>16)*.3+((c>>8)&255)*.59+(c&255)*.11;[['nm',0],['nr',1]].forEach(([id,i])=>{const e=$(id);e.textContent=TEAMS[t[i]].sh;e.style.background=hex(sc[i]);e.style.color=lum(sc[i])>150?'#0b1226':'#fff'})}
let curTeams=[0,2];const look=(f,t)=>{curTeams=t;buildField(f);kit(t);board(t)};
// name tags for every real player (team coloured) + "PASS!" call bubbles (own team only)
const tagCache={},tags=s.ps.map(()=>{const sp=new THREE.Sprite(new THREE.SpriteMaterial({transparent:true,depthTest:false}));sp.scale.set(6,1.5,1);sp.visible=false;scene.add(sp);return{sp,key:''}});
function tagTex(txt,col,fg){const key=txt+col+fg;if(tagCache[key])return tagCache[key];const c=document.createElement('canvas');c.width=256;c.height=64;const g=c.getContext('2d');g.fillStyle=col;g.beginPath();g.roundRect?g.roundRect(8,10,240,44,22):g.rect(8,10,240,44);g.fill();g.font='900 30px Impact,Arial Narrow,sans-serif';g.textAlign='center';g.fillStyle=fg;g.fillText(txt,128,44,220);return tagCache[key]=new THREE.CanvasTexture(c)}
const callTex=(()=>{const c=document.createElement('canvas');c.width=256;c.height=96;const g=c.getContext('2d');g.fillStyle='#ff2e88';g.beginPath();g.moveTo(20,10);g.lineTo(236,10);g.lineTo(236,60);g.lineTo(140,60);g.lineTo(128,84);g.lineTo(116,60);g.lineTo(20,60);g.closePath();g.fill();g.font='900 40px Impact,Arial';g.textAlign='center';g.fillStyle='#fff';g.fillText('PASS!',128,50);return new THREE.CanvasTexture(c)})();
const calls=s.ps.map(()=>{const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:callTex,transparent:true,depthTest:false}));sp.scale.set(5,1.9,1);sp.visible=false;scene.add(sp);return sp});

const banterCache={};
function banterTex(txt:string){if(banterCache[txt])return banterCache[txt];const c=document.createElement('canvas');c.width=256;c.height=96;const g=c.getContext('2d')!;g.fillStyle='#ff2e88';g.beginPath();g.roundRect?g.roundRect(10,10,236,54,18):g.rect(10,10,236,54);g.fill();g.beginPath();g.moveTo(116,64);g.lineTo(128,84);g.lineTo(140,64);g.closePath();g.fill();g.font='900 32px Impact,Arial';g.textAlign='center';g.fillStyle='#fff';g.fillText(txt,128,48,220);return banterCache[txt]=new THREE.CanvasTexture(c)}
const banterMsg=Array(10).fill(''),banterTime=Array(10).fill(0);
const banterSprites=s.ps.map(()=>{const sp=new THREE.Sprite(new THREE.SpriteMaterial({transparent:true,depthTest:false}));sp.scale.set(6,2.25,1);sp.visible=false;scene.add(sp);return sp});
function triggerBanter(k:number,txt:string){banterMsg[k]=txt;banterTime[k]=Date.now()+2500;banterSprites[k].material.map=banterTex(txt);banterSprites[k].material.needsUpdate=true;if(online)online.send('banter',{txt})}

function tagsUpdate(){const myT=s.ps[me].t,sc=shirts(curTeams),now=Date.now();s.ps.forEach((p,k)=>{const g=rigs[k].g.position,tg=tags[k],nm=p.off?'':online?(s.nicks&&s.nicks[k]):(k===me?nick:'');
 if(nm){const col=hex(sc[p.t]),fg=((sc[p.t]>>16)*.3+((sc[p.t]>>8)&255)*.59+(sc[p.t]&255)*.11)>150?'#0b1226':'#fff',key=nm+col;if(tg.key!==key){tg.key=key;tg.sp.material.map=tagTex(nm,col,fg);tg.sp.material.needsUpdate=true}tg.sp.visible=true;tg.sp.position.set(g.x,k===me?6.4:5.6,g.z)}else tg.sp.visible=false;
 const on=!p.off&&p.t===myT&&(online?s.calls&&s.calls.has(k):p.cl>0),c=calls[k];c.visible=!!on;if(on)c.position.set(g.x,7.4+Math.abs(Math.sin(tt*8))*.5,g.z);
 const actB=banterTime[k]>now,bs=banterSprites[k];bs.visible=actB;if(actB)bs.position.set(g.x,8.2+Math.sin(tt*6)*.3,g.z)})}

const ballM=new THREE.Mesh(new THREE.SphereGeometry(.55,12,10),new THREE.MeshLambertMaterial({color:0xffffff}));scene.add(ballM);const ballSh=blob(.6);
const mark=new THREE.Mesh(new THREE.ConeGeometry(.5,1,4),new THREE.MeshBasicMaterial({color:0x35e0ff}));mark.rotation.x=Math.PI;scene.add(mark);

// ===== PARTICLES (ball trail & slide tackle dust) =====
const MAX_P=60,pGeo=new THREE.BufferGeometry(),pPos=new Float32Array(MAX_P*3),pCol=new Float32Array(MAX_P*3),pLife=new Float32Array(MAX_P),pVel=new Float32Array(MAX_P*3);
pGeo.setAttribute('position',new THREE.BufferAttribute(pPos,3));pGeo.setAttribute('color',new THREE.BufferAttribute(pCol,3));
const pMat=new THREE.PointsMaterial({size:.6,vertexColors:true,transparent:true,opacity:.8,depthWrite:false}),pPoints=new THREE.Points(pGeo,pMat);scene.add(pPoints);
function spawnP(x:number,y:number,z:number,vx:number,vy:number,vz:number,cr:number,cg:number,cb:number,life:number){
 for(let i=0;i<MAX_P;i++){if(pLife[i]<=0){pPos[i*3]=x;pPos[i*3+1]=y;pPos[i*3+2]=z;pVel[i*3]=vx;pVel[i*3+1]=vy;pVel[i*3+2]=vz;pCol[i*3]=cr;pCol[i*3+1]=cg;pCol[i*3+2]=cb;pLife[i]=life;break}}
}
function updateP(dt:number){
 for(let i=0;i<MAX_P;i++){if(pLife[i]>0){pLife[i]-=dt;if(pLife[i]<=0){pLife[i]=0;pPos[i*3+1]=-100}else{pPos[i*3]+=pVel[i*3]*dt;pPos[i*3+1]+=pVel[i*3+1]*dt;pPos[i*3+2]+=pVel[i*3+2]*dt}}}
 (pGeo.attributes.position as any).needsUpdate=true;(pGeo.attributes.color as any).needsUpdate=true;
}

let cx=0,cz=0,tt=0;
function render(dt){tt+=dt;
 s.ps.forEach((p,k)=>{const r=rigs[k],sp=Math.hypot(p.vx,p.vy);r.g.visible=r.sh.visible=!p.off;r.g.position.set((p.x-W/2)*K,0,(p.y-H/2)*K);
  let da=Math.atan2(p.fx,p.fy)-r.ang;da=Math.atan2(Math.sin(da),Math.cos(da));r.ang+=da*Math.min(1,dt*14);r.g.rotation.y=r.ang;
  r.ph+=sp*dt*.09;const w=Math.sin(r.ph)*.9*Math.min(1,sp/150),cel=s.kind==='goal'&&s.pause>0&&p.t===s.gt;
  r.legs[0].rotation.x=w+(p.kk>0?-1.2:0);r.legs[1].rotation.x=-w;r.arms[0].rotation.x=cel?-2.8:-w*.9;r.arms[1].rotation.x=cel?-2.8:w*.9;
  r.body.rotation.x=p.sl>0?-1.1:Math.min(.4,sp/500);r.g.rotation.z=p.stun>0?.5:0;r.g.position.y=(p.sl>0?-.7:0)+(cel?Math.abs(Math.sin(tt*10+k))*1.1:0);
  r.sh.position.x=r.g.position.x;r.sh.position.z=r.g.position.z;
  if(p.sl>0&&Math.random()<.5)spawnP(r.g.position.x+(Math.random()-.5),.2,r.g.position.z+(Math.random()-.5),(Math.random()-.5)*2,Math.random()*2+1,(Math.random()-.5)*2,.75,.65,.5,.35)});
 const b=s.ball,bx=(b.x-W/2)*K,bz=(b.y-H/2)*K;ballM.position.set(bx,.55+b.h*K,bz);ballM.rotation.z-=b.vx*dt*K/.55;ballM.rotation.x+=b.vy*dt*K/.55;ballSh.position.set(bx,.04,bz);ballSh.scale.setScalar(.6/(1+b.h*.02));
 const bSpd=Math.hypot(b.vx,b.vy);if(bSpd>260&&Math.random()<.6)spawnP(bx,.55+b.h*K,bz,(Math.random()-.5)*2,Math.random()*1.5,(Math.random()-.5)*2,.98,.8,.2,.25);
 updateP(dt);
 const mg=rigs[me].g.position;mark.position.set(mg.x,5+Math.sin(tt*5)*.25,mg.z);tagsUpdate();
 const k=1.2*Math.max(1,1.9/cam.aspect);cx+=(clamp(bx,-30,30)-cx)*Math.min(1,dt*3);cz+=(bz*.5-cz)*Math.min(1,dt*3);
 cam.position.set(cx,30*k,cz+26*k);cam.lookAt(cx,0,cz);ren.render(scene,cam)}
function resize(){ren.setSize(innerWidth,innerHeight,false);cam.aspect=innerWidth/innerHeight;cam.updateProjectionMatrix()}addEventListener('resize',resize);resize();
const mmc=$('mm'),mx_=mmc.getContext('2d');
function minimap(){const w=260,h=148,sx=w/W,sy=h/H;mx_.clearRect(0,0,w,h);mx_.fillStyle='rgba(30,30,25,.55)';mx_.fillRect(0,0,w,h);mx_.strokeStyle='rgba(255,255,255,.5)';mx_.strokeRect(2,2,w-4,h-4);mx_.beginPath();mx_.moveTo(w/2,0);mx_.lineTo(w/2,h);mx_.stroke();
 s.ps.forEach((p,k)=>{mx_.fillStyle=k===me?'#35e0ff':p.t?'#4d8cff':'#f0e6c8';mx_.beginPath();mx_.arc(p.x*sx,p.y*sy,k===me?6:4.5,0,7);mx_.fill()});mx_.fillStyle='#fff';mx_.beginPath();mx_.arc(s.ball.x*sx,s.ball.y*sy,3.5,0,7);mx_.fill()}
// ===== INPUT =====
const keys={},btn={},press={},stick={x:0,y:0};let paused=false;
const KM={' ':'shoot',e:'pass',r:'thru',f:'lob',shift:'sprint',c:'shield',v:'skill',q:'tackle'};
addEventListener('keydown',e=>{if(e.target.tagName==='INPUT')return;const k=e.key.toLowerCase();keys[k]=1;if(KM[k])press[KM[k]]=1;if(k==='x')sw();if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k))e.preventDefault()});
addEventListener('keyup',e=>{keys[e.key.toLowerCase()]=0});
function sw(){if(online)return;let best=-1,bd=1e9;s.ps.forEach((q,j)=>{if(q.t===0&&!q.off&&j!==me){const d=Math.hypot(q.x-s.ball.x,q.y-s.ball.y);if(d<bd){bd=d;best=j}}});if(best>=0)me=best}
$('sw').onpointerdown=sw;
$('snd').onclick=()=>{const m=toggleMute();$('snd').textContent=m?'🔇':'🔊';sfxTap()};
$('pz').onclick=()=>{paused=!paused;$('pz').textContent=paused?'>':'II';sfxTap()};
const bdiv=$('banter');if(bdiv)bdiv.onclick=e=>{const b=(e.target as HTMLElement).closest('button');if(b&&b.dataset.b){triggerBanter(me,b.dataset.b);sfxTap()}};
const zone=$('zone'),ring=zone.querySelector('i'),knob=$('knob');let sid=null,ox=0,oy=0;
function sv(e){let dx=e.clientX-ox,dy=e.clientY-oy;const m=Math.hypot(dx,dy);if(m>55){dx*=55/m;dy*=55/m}stick.x=dx/55;stick.y=dy/55;knob.style.transform=`translate(${dx}px,${dy}px)`}
zone.onpointerdown=e=>{sid=e.pointerId;zone.setPointerCapture(sid);ox=e.clientX;oy=e.clientY;ring.style.cssText=`display:block;left:${ox-55}px;top:${oy-55}px`;sv(e)};
zone.onpointermove=e=>{if(e.pointerId===sid)sv(e)};
zone.onpointerup=zone.onpointercancel=()=>{sid=null;stick.x=stick.y=0;knob.style.transform='';ring.style.display='none'};
document.querySelectorAll('#btns button').forEach(b=>{const k=b.dataset.k;b.onpointerdown=e=>{btn[k]=1;press[k]=1;b.setPointerCapture(e.pointerId)};b.onpointerup=b.onpointercancel=()=>{btn[k]=0}});
addEventListener('contextmenu',e=>e.preventDefault());
let chg=0,wasDown=0,fdt=0,pgSw=0,pgSt=0;
function gp(){const g=navigator.getGamepads?[...navigator.getGamepads()].find(x=>x&&x.connected):null;if(!g)return null;const dz=v=>Math.abs(v)>.18?v:0,B=i=>!!(g.buttons[i]&&g.buttons[i].pressed);let mx=dz(g.axes[0]||0),my=dz(g.axes[1]||0);if(B(14))mx-=1;if(B(15))mx+=1;if(B(12))my-=1;if(B(13))my+=1;
 return{mx,my,pass:B(0),lob:B(1),shoot:B(2),thru:B(3),sw:B(4),sprint:B(5),shield:B(6),skill:B(7),start:B(9)}}
function human(){const g=gp(),o={mx:stick.x+(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0),my:stick.y+(keys.s||keys.arrowdown?1:0)-(keys.w||keys.arrowup?1:0)};
 const on=k=>btn[k]||press[k]||Object.keys(KM).some(c=>KM[c]===k&&keys[c])||(g&&g[k]);
 if(g){o.mx+=g.mx;o.my+=g.my;if(g.sw&&!pgSw)sw();pgSw=g.sw;if(g.start&&!pgSt){$('mb').click()}pgSt=g.start}
 for(const k of['sprint','pass','lob','thru','shield','skill','tackle'])o[k]=on(k)?1:0;
 const opp=s.own>=0&&s.ps[s.own].t!==s.ps[me].t,down=!opp&&on('shoot');if(down)chg+=fdt;o.shoot=0;if(!down&&wasDown){o.shoot=clamp(.4+chg*.75,.4,1);chg=0}wasDown=down;
 $('pwr').style.display=down?'block':'none';$('pwr').firstChild.style.width=Math.min(100,(.4+chg*.75)*100)+'%';
 if(opp){o.press=o.pass;o.pass=0;if(on('shoot'))o.tackle=1;if(o.lob){o.slide=1;o.lob=0}}else if(s.own>=0&&s.own!==me&&s.ps[s.own].t===s.ps[me].t&&o.pass){o.call=1;o.pass=0}else if(s.own!==me&&o.pass){o.tackle=1;o.pass=0}o.h=1;return o} // defending: X press, Square tackle, Circle slide
// ===== UI + LOOP =====
function auto(){if(s.mode==='shootout'||s.pause>0)return;if(s.own>=0&&s.ps[s.own].t===0){me=s.own;return}
 let bd=Math.hypot(s.ps[me].x-s.ball.x,s.ps[me].y-s.ball.y),bi=me;s.ps.forEach((q,j)=>{if(q.t===0&&!q.off){const d=Math.hypot(q.x-s.ball.x,q.y-s.ball.y);if(d<bd-25){bd=d;bi=j}}});me=bi}
const portrait=()=>matchMedia('(orientation:portrait) and (pointer:coarse)').matches;
function lockLand(){const e=document.documentElement;try{(e.requestFullscreen?e.requestFullscreen():Promise.reject()).then(()=>screen.orientation&&screen.orientation.lock&&screen.orientation.lock('landscape')).catch(()=>{})}catch(x){}}
let shown='',last=performance.now(),acc=0,loaded=false;
let curScreen='',padUsed=false,padPrev:any={},padT=0,padKeep='';
// ===== GAMEPAD IN MENUS: d-pad / left stick moves the highlight, A (cross) selects, B (circle) goes back, Start resumes =====
const padEls=()=>[...document.querySelectorAll('#menu button:not([disabled]),#menu input')].filter((e:any)=>e.offsetParent!==null);
function padFocus(e:any){document.querySelectorAll('#menu .pf').forEach((x:any)=>x.classList.remove('pf'));e.classList.add('pf');e.scrollIntoView({block:'nearest',inline:'nearest'})}
function padNav(dir:string){const els:any[]=padEls();if(!els.length)return;const cur:any=els.find(e=>e.classList.contains('pf'));if(!cur){padFocus(els[0]);return}
 const sp:any=cur.closest&&cur.closest('.sp');if(sp&&(dir==='l'||dir==='r')){const a:any=sp.querySelector('.ar[data-d="'+(dir==='l'?-1:1)+'"]');if(a&&!a.disabled){a.click();return}}
 const r=cur.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;let best:any=null,bs=1e9;
 els.forEach(e=>{if(e===cur)return;const q=e.getBoundingClientRect(),dx=q.left+q.width/2-cx,dy=q.top+q.height/2-cy,h=dir==='r'||dir==='l';
  if(!(dir==='r'?dx>4:dir==='l'?dx<-4:dir==='d'?dy>4:dy<-4))return;const sc=(h?Math.abs(dx):Math.abs(dy))+(h?Math.abs(dy):Math.abs(dx))*2.5;if(sc<bs){bs=sc;best=e}});
 if(best)padFocus(best)}
function padPoll(now:number){const g:any=navigator.getGamepads?[...navigator.getGamepads()].find((x:any)=>x&&x.connected):null;
 document.body.classList.toggle('inm',inMenu);if(!g)return;
 const B=(i:number)=>!!(g.buttons[i]&&g.buttons[i].pressed),ax=g.axes[0]||0,ay=g.axes[1]||0;
 const st:any={a:B(0),b:B(1),s:B(9),dir:B(12)||ay<-.6?'u':B(13)||ay>.6?'d':B(14)||ax<-.6?'l':B(15)||ax>.6?'r':''};
 if(st.a||st.b||st.s||st.dir)padUsed=true;
 if(!inMenu){padPrev=st;return}
 const pd=padPrev.dir||'';if(st.dir){if(st.dir!==pd){padNav(st.dir);padT=now+380}else if(now>=padT){padNav(st.dir);padT=now+140}}
 if(st.a&&!padPrev.a){const f:any=document.querySelector('#menu .pf');if(f&&f.offsetParent!==null){f.tagName==='INPUT'?f.focus():f.click()}else{const e:any=padEls();if(e[0])padFocus(e[0])}}
 if(st.b&&!padPrev.b){const t:any=document.querySelector('#menu [data-to]')||document.getElementById('rsm')||document.getElementById('lv');if(t)t.click()}
 if(st.s&&!padPrev.s&&curScreen==='pause')$('rsm').click();
 padPrev=st;
 if(padUsed&&!document.querySelector('#menu .pf')){const e:any[]=padEls();let f:any=padKeep&&document.querySelector('#menu .sp[data-sp="'+padKeep+'"] .ar:not([disabled])');padKeep='';f=f||e.find(x=>x.classList.contains('go'))||e[0];if(f)padFocus(f)}}
const pt=document.createElement('div');pt.id='pt';document.body.appendChild(pt);const ph=document.createElement('div');ph.id='padhint';ph.textContent='A select  -  B back  -  Start pause';document.body.appendChild(ph);
function flash(t:string){pt.textContent=t;pt.style.display='block';setTimeout(()=>{pt.style.display='none'},2500)}
addEventListener('gamepadconnected',()=>{document.body.classList.add('pad');padUsed=true;flash('Gamepad connected')});
addEventListener('gamepaddisconnected',()=>{document.body.classList.remove('pad');flash('Gamepad disconnected')});
let sumT:any=0,sumData:any=null;let lastOpp=null;
const POOL=['Chidi','Tunde','Emeka','Musa','Bashir','Segun','Ifeanyi','Yusuf','Kelechi','Ayo'];
const nm=(k:number,h?:any)=>online?((s.nicks&&s.nicks[k])||POOL[k%10]):(h?nick:POOL[k%10]); // humans by name, bots by pool name
function showSummary(){const m=$('menu');inMenu=true;m.className='sumv';
 if(s.mode!=='match'){m.innerHTML=`<h2>${s.mode==='shootout'?'Shootout':'Training'}</h2><div class="big">${s.score[0]}${s.mode==='shootout'?' / 5':''}</div>`+(online?'':`<div class="row"><button class="go" id="rs">Play again</button><button class="chip" id="mn">Menu</button></div>`);return}
 const d=online?sumData:summary(s);if(!d)return;
 const hu=(k:number)=>d.rows[k]&&d.rows[k].hu,N=(k:number)=>nm(k,hu(k)),T=d.names;
 const sc=[0,1].map(t=>d.ev.filter((e:any)=>e.t===t).map((e:any)=>`<div>${e.mn}' ${e.k>=0?N(e.k):''}${e.og?' (OG)':''}${e.as>=0?` <small>(${N(e.as)})</small>`:''}</div>`).join('')||'<div><small>-</small></div>');
 const bar=(l:string,a:number,b:number)=>{const p=a+b?a/(a+b)*100:50;return`<div class="st"><span>${a}</span><i><u style="width:${p}%"></u></i><span>${b}</span><em>${l}</em></div>`};
 const tm=d.team,mv=d.rows[d.motm],top=d.rows.slice().sort((a:any,b:any)=>b.r-a.r).slice(0,5);
 m.innerHTML=`<div class="sg"><div><div class="sc"><b>${T[0]}</b> <span class="big">${d.score[0]} - ${d.score[1]}</span> <b>${T[1]}</b></div><div class="two"><div>${sc[0]}</div><div>${sc[1]}</div></div>${bar('Possession %',tm[0].poss,tm[1].poss)}${bar('Shots',tm[0].sh,tm[1].sh)}${bar('Pass accuracy %',tm[0].pacc,tm[1].pacc)}${bar('Fouls',tm[0].fl,tm[1].fl)}</div>
 <div><div class="motm"><small>MAN OF THE MATCH</small><b>${N(mv.k)}</b><span>${T[mv.t]} - rated ${mv.r.toFixed(1)}</span><small>${mv.g} goal${mv.g===1?'':'s'}, ${mv.a} assist${mv.a===1?'':'s'}, ${mv.tk} tackle${mv.tk===1?'':'s'}</small></div><div class="rt">${top.map((r:any)=>`<div><span>${N(r.k)} <small>${T[r.t]}</small></span><b>${r.r.toFixed(1)}</b></div>`).join('')}</div></div></div>`+(online?`<small>Back to the waiting room shortly...</small><button class="chip" id="lv">Leave</button>`:`<div class="row"><button class="go" id="rs">Play again</button><button class="chip" id="mn">Menu</button></div>`)}
const lb=(k,t)=>{document.querySelector('[data-k='+k+'] small').textContent=t};
let prevPause=0,prevKind='',prevOver=false,prevHalf=1,prevBallSpd=0,prevSlides=Array(10).fill(0);
function audioCheck(){
 if(s.pause>0&&prevPause<=0){if(s.kind==='goal')sfxGoal();else if(s.kind==='foul'||s.kind==='pen')sfxWhistle()}
 if(s.over&&!prevOver)sfxWhistle();if(s.half!==prevHalf){sfxWhistle();prevHalf=s.half}
 prevPause=s.pause;prevKind=s.kind;prevOver=s.over;
 const bSpd=Math.hypot(s.ball.vx,s.ball.vy);if(bSpd-prevBallSpd>140&&bSpd>180)sfxKick(Math.min(1,bSpd/600));prevBallSpd=bSpd;
 s.ps.forEach((p,k)=>{if(p.sl>0&&prevSlides[k]<=0)sfxSlide();prevSlides[k]=p.sl})
}
function ui(){audioCheck();const opp=s.own>=0&&s.ps[me]&&s.ps[s.own].t!==s.ps[me].t;const md=opp?1:(s.own>=0&&s.own!==me&&s.ps[s.own].t===s.ps[me].t)?2:0;if(md!==lastOpp){lastOpp=md;lb('pass',['Pass','Press','Call'][md]);lb('shoot',opp?'Tackle':'Shoot');lb('lob',opp?'Slide':'Lob');lb('thru',opp?'-':'Through')}const sh=s.mode==='shootout',tr=s.mode==='training',m=Math.max(0,Math.ceil(s.time));$('sa').textContent=s.score[0];$('sb').textContent=s.score[1];
 $('tm').textContent=tr?'FREE':Math.floor(m/60)+':'+String(m%60).padStart(2,'0');$('hf').textContent=sh?'ROUND '+Math.min(s.round,5)+' OF 5':tr?'TRAINING':s.half===1?'1ST HALF':'2ND HALF';
 $('toast').style.display=s.pause>0&&s.msg==='Kickoff'?'block':'none';
 const txt=s.over?'FULL TIME':(s.msg==='Kickoff'?'':s.msg);let sub=s.over?(sh?`${s.score[0]} / 5`:`${s.score[0]} - ${s.score[1]}`):(s.pause>0?s.sub||'':'');
 if(!s.over&&s.kind==='goal'&&s.pause>0&&s.sc>=0&&s.mode==='match')sub=`${nm(s.sc,s.st&&s.st[s.sc]&&s.st[s.sc].hu>10)}${s.og?' (OG)':''} ${s.mn}'${s.as>=0?' - assist '+nm(s.as,s.st&&s.st[s.as]&&s.st[s.as].hu>10):''} - ${s.sub}`;
 const key=txt+'|'+sub+'|'+s.kind+s.over;
 if(key!==shown){shown=key;const mg=$('msg');mg.className='k-'+(s.over?'info':s.kind||'info');mg.innerHTML=txt?`<span class="pop">${txt}</span><small>${sub}</small>`:''}
 if(s.over&&!sumT){sumT=setTimeout(()=>{if(s.over)showSummary()},2300)}else if(!s.over&&sumT){clearTimeout(sumT);sumT=0}}
// ===== APP FLOW: name -> modes -> settings -> match =====
const roomParam=new URLSearchParams(location.search).get('room');let roomUsed=false;const cfg={len:150,diff:1,field:'street',teams:[0,2]},CH=['Odogwu','Sharp Boy','Jagaban','Small Pele','Oga Striker','Zaki','Baller','Golden Boy'];
const chips=(a,key,cur)=>a.map(([v,l])=>`<button class="chip${cur===v?' on':''}" data-${key}="${v}">${l}</button>`).join('');
function show(n){curScreen=n;inMenu=true;const m=$('menu');m.className='';
 if(n==='name')m.innerHTML=`<small>GUEST PLAYER</small><h2>Pick your street name</h2><input id="ni" maxlength="14" placeholder="ODOGWU" value="${nick}" aria-label="Nickname"><div class="row">${CH.map(c=>`<button class="chip" data-n="${c}">${c}</button>`).join('')}</div><small>This shows above your player.</small><button class="go" id="gn">Continue</button>`;
 else if(n==='online')m.innerHTML=`<h2>Play online</h2><div class="row"><button class="card" id="oq">Quick match<span>Starts automatically, bots fill in</span></button><button class="card" id="op">Private room<span>Play with friends</span></button></div><small>Got a room code?</small><input id="oc" maxlength="6" placeholder="CODE" aria-label="Room code"><div class="row"><button class="go" id="oj">Join room</button></div><small id="oe"></small><button class="chip" data-to="modes">Back</button>`;
 else if(n==='modes')m.innerHTML=`<small>Playing as ${nick}</small><h2>Pick your game</h2><div class="row"><button class="card" id="qm">Quick match<span>5v5 vs CPU, two halves</span></button><button class="card" id="tr">Training<span>Free play, no clock</span></button><button class="card" id="so">Shootout<span>5 rounds, beat the defender</span></button><button class="card" id="ol">Play online<span>Live match with friends</span></button></div><button class="chip" data-to="name">Change name</button>`;
 else if(n==='pause'){m.className='ov';m.innerHTML=`<h2>Paused</h2><small>${online?'A bot plays for you while this menu is open':'Match paused'}</small><button class="go" id="rsm">Resume</button><button class="chip" id="lvm">Leave match</button>`;if(online)online.send('afk',{on:1})}
 else if(n==='lobby')lobby();
 else m.innerHTML=`<h2>Match setup</h2><div class="stp">${spTeam('t0',cfg.teams[0],cfg.teams,1,'Your team')}${spField(cfg.field,1)}${spTeam('t1',cfg.teams[1],cfg.teams,1,'Opponent')}</div><div class="opts"><span>Half</span>${chips([[60,'1:00'],[150,'2:30'],[300,'5:00']],'l',cfg.len)}<span>CPU</span>${chips([[.85,'Easy'],[1,'Normal'],[1.12,'Hard']],'d',cfg.diff)}</div><div class="row"><button class="go" id="st">Kick off</button><button class="chip" data-to="modes">Back</button></div>`}
const jersey=(c:number,s:number)=>`<svg class="jy" viewBox="0 0 64 64"><path d="M20 6 6 14l6 12 6-3v31h28V23l6 3 6-12-14-8c-2 5-6 7-12 7S22 11 20 6z" fill="${hex(c)}" stroke="rgba(255,255,255,.4)" stroke-width="1.5"/><rect x="21" y="47" width="22" height="12" rx="2" fill="${hex(s)}"/></svg>`;
const arrows=(on:boolean,body:string)=>`<div class="rw"><button class="ar" data-d="-1" ${on?'':'disabled'} aria-label="Previous">&#8249;</button><div class="c2">${body}</div><button class="ar" data-d="1" ${on?'':'disabled'} aria-label="Next">&#8250;</button></div>`;
const spTeam=(key:string,idx:number,ids:number[],on:any,label:string)=>{const T=TEAMS[idx],side=key==='t0'?0:1,sc=shirts(ids),away=side===1&&sc[1]!==T.c;
 return`<div class="sp${on?'':' off'}" data-sp="${key}"><small class="lb">${label}</small>${arrows(!!on,`${jersey(sc[side],away?T.c:T.s)}<b>${T.n}</b><span>${away?'away kit':on?'tap < > to change':'picked by captain'}</span>`)}</div>`};
const spField=(cur:string,on:any)=>{const F=FIELDS.find(f=>f.id===cur)||FIELDS[0];return`<div class="sp${on?'':' off'}" data-sp="fd"><small class="lb">Stadium</small>${arrows(!!on,`<div class="th ${F.id}"></div><b>${F.n}</b><span>${on?'tap < > to change':'picked by captain'}</span>`)}</div>`};
function spinStep(key:string,dir:number,onl:boolean){const T=TEAMS.length,F=FIELDS.length;
 if(key==='fd'){const cur=onl?lob.field:cfg.field,i=FIELDS.findIndex(f=>f.id===cur),nx=FIELDS[(i+dir+F)%F].id;if(onl)online.send('cfg',{field:nx});else{cfg.field=nx;show('set')}}
 else{const sd=key==='t0'?0:1,tm=onl?lob.teams:cfg.teams;let v=(tm[sd]+dir+T)%T;if(v===tm[1-sd])v=(v+dir+T)%T;if(onl)online.send('cfg',{team:v,side:sd});else{cfg.teams[sd]=v;show('set')}}
 padKeep=key}
const dot=c=>`<i class="dt" style="background:${hex(c)}"></i>`;
const fieldRow=(cur,on)=>FIELDS.map(f=>`<button class="chip${cur===f.id?' on':''}" ${on?`data-fd="${f.id}"`:'disabled'}>${f.n}</button>`).join('');
const teamRow=(side,cur,on)=>TEAMS.map((t,i)=>`<button class="chip${cur===i?' on':''}" ${on?`data-t${side}="${i}"`:'disabled'}>${dot(t.c)}${t.n}</button>`).join('');
// online lobby: coin toss between the two captains, winner picks the stadium; captains pick their own kit
function lobby(){const c=lob,both=c.caps[0]>=0&&c.caps[1]>=0,chooser=me===c.chooser,host=me===c.host,mine=c.pl.find(p=>p.idx===me);
 let h=`<small>ROOM ${c.code}</small>`;
 if(c.phase==='wait')h+=`<h2>Finding players</h2><small>${c.pl.length}/10 in the room. Starting in ${c.eta}s, bots fill the empty spots.</small><div class="row">${c.pl.map(p=>`<span class="chip on">${p.nick}</span>`).join('')}</div>`;
 else if(c.phase==='lobby'){
  h+=`<h2>Waiting room</h2><div class="row"><button class="chip" id="cl">Share invite link</button></div>`;
  h+=host?`<div class="row">${[['versus','Against each other'],['coop','Together vs bots']].map(([v,l])=>`<button class="chip${c.mode===v?' on':''}" data-mode="${v}">${l}</button>`).join('')}</div>`:`<small>${c.mode==='coop'?'Together vs bots':'Against each other'}</small>`;
  const pr=(p:any)=>`<div class="pl${p.ready?' rd':''}${p.idx===me?' me':''}"><span>${p.idx===c.host?'&#9733; ':''}${p.nick}</span>${host&&p.idx!==me?`<button class="ic" data-host="${p.idx}" aria-label="Make host">&#9733;</button><button class="ic" data-kick="${p.idx}" aria-label="Kick">&#10005;</button>`:''}</div>`;
  h+=`<div class="wr">${[0,1].map(sd=>`<div><small>${c.mode==='coop'?(sd?'Bots':'Your team'):'Team '+(sd?'B':'A')}</small>${c.mode==='coop'&&sd?'<div class="pl"><span>5 bots</span></div>':(c.pl.filter((p:any)=>(p.idx<5?0:1)===sd).map(pr).join('')||'<div class="pl"><span>-</span></div>')}</div>`).join('')}</div>`;
  if(c.mode==='versus')h+=`<button class="chip" id="sd">Switch my side</button>`;
  h+=host?`<button class="go" id="ls">Start match</button><small>Everyone else must tap Ready first.</small>`:`<button class="go" id="rd">${mine&&mine.ready?'Not ready':"I'm ready"}</button>`}
 else if(c.phase==='toss')h+=`<h2>Coin toss</h2>`+(me===c.caller?`<small>You are captain. Call it!</small><div class="row"><button class="go" data-call="H">Heads</button><button class="go" data-call="T">Tails</button></div>`:`<small>The captain is calling the coin...</small>`);
 else{h+=`<h2>Match setup</h2>`;if(c.toss)h+=`<small>It landed ${c.toss.result==='H'?'heads':'tails'}. ${TEAMS[c.teams[c.toss.winner]].sh} captain picks the stadium.</small>`;
  const on=i=>both?me===c.caps[i]:chooser;
  h+=`<div class="stp">${spTeam('t0',c.teams[0],c.teams,on(0),'Team A')}${spField(c.field,chooser)}${spTeam('t1',c.teams[1],c.teams,on(1),'Team B')}</div>`;
  h+=chooser?`<button class="go" id="ls">Kick off</button>`:`<small>Waiting for the captain to start...</small>`}
 $('menu').innerHTML=h+`<button class="chip" id="lv">Leave</button>`}
function lobbyClick(b,d){if(d.d!==undefined){spinStep(b.closest('.sp').dataset.sp,+d.d,true);return true}if(d.fd)online.send('cfg',{field:d.fd});else if(d.t0!==undefined)online.send('cfg',{team:+d.t0,side:0});else if(d.t1!==undefined)online.send('cfg',{team:+d.t1,side:1});else if(d.call)online.send('call',{c:d.call});
 else if(d.mode)online.send('mode',{m:d.mode});else if(d.kick)online.send('kick',{idx:+d.kick});else if(d.host)online.send('host',{idx:+d.host});else if(b.id==='rd')online.send('rdy');else if(b.id==='sd')online.send('side');
 else if(b.id==='cl'){const url=location.origin+location.pathname+'?room='+lob.code;try{navigator.share?navigator.share({title:'Join my Street FC room',url}):navigator.clipboard.writeText(url);b.textContent='Link ready'}catch(e){b.textContent=url}}
 else if(b.id==='ls')online.send('start');else if(b.id==='lv'){const r=online;online=null;lob=null;r.leave();show('modes')}else return false;return true}
$('menu').onclick=e=>{sfxTap();lockLand();const b=e.target.closest('button');if(!b||b.disabled)return;const d=b.dataset;if(online&&lob&&lobbyClick(b,d))return;
 if(d.d!==undefined)spinStep(b.closest('.sp').dataset.sp,+d.d,false);else if(d.n)$('ni').value=d.n.toUpperCase();else if(d.l){cfg.len=+d.l;show('set')}else if(d.fd){cfg.field=d.fd;show('set')}else if(d.t0!==undefined){cfg.teams[0]=+d.t0;show('set')}else if(d.t1!==undefined){cfg.teams[1]=+d.t1;show('set')}else if(d.d){cfg.diff=+d.d;show('set')}else if(d.to)show(d.to);
 else if(b.id==='gn'){nick=($('ni').value.replace(/[^\w ]/g,'').trim().toUpperCase().slice(0,14))||'ODOGWU';if(roomParam&&!roomUsed){roomUsed=true;goOnline(roomParam,'join')}else show('modes')}
 else if(b.id==='rs')start({mode:s.mode,len:s.len,diff:s.diff});else if(b.id==='mn')show('modes');else if(b.id==='rsm'){$('menu').className='hide';inMenu=false;if(online)online.send('afk',{on:0})}else if(b.id==='lvm'){if(online){online.leave();online=null}show('modes')}else if(b.id==='ol')show('online');else if(b.id==='oq')goOnline('QUICK','quick');else if(b.id==='op')goOnline(Math.random().toString(36).slice(2,7).toUpperCase(),'create');else if(b.id==='oj')goOnline($('oc').value,'join');else if(b.id==='qm')show('set');else if(b.id==='tr')start({mode:'training'});else if(b.id==='so')start({mode:'shootout',diff:cfg.diff});else if(b.id==='st')start({mode:'match',len:cfg.len,diff:cfg.diff})};
function start(o){o={...o,names:[TEAMS[cfg.teams[0]].sh,TEAMS[cfg.teams[1]].sh]};s=mk(o);look(cfg.field,cfg.teams);me=4;shown='';acc=0;paused=false;$('pz').textContent='II';$('menu').className='hide';inMenu=false}
$('mb').onclick=()=>show('pause');look(cfg.field,cfg.teams);show('name');const dbg=new URLSearchParams(location.search).get('screen');if(dbg==='set')show('set');
function loop(n){const dt=Math.min(.1,(n-last)/1000);last=n;padPoll(n);
 if(online){fdt=dt;netTick(s,dt);if(!inMenu&&!portrait()){const hu=human();sendIn(hu,n);for(const k in press)press[k]=0}}else if(!paused&&!inMenu&&!portrait()){acc+=dt;auto();fdt=dt;const hu=human();while(acc>=1/60){step(s,s.ps.map((p,k)=>k===me?hu:(p.off||(s.mode==='training'&&p.t)?NOACT:ai(s,k))),1/60);acc-=1/60}for(const k in press)press[k]=0}
 render(dt);minimap();ui();
 if(!loaded){loaded=true;$('lp').textContent='Setting up the street... 99%';$('lb').style.width='99%';setTimeout(()=>{$('load').style.opacity=0;setTimeout(()=>$('load').remove(),450)},700)}
 requestAnimationFrame(loop)}
// ===== ONLINE: the server runs the sim; we send inputs and render its snapshots =====
function wire(room:any){online=room;shown='';
 room.onMessage('you',(m:any)=>{me=m.idx});room.onMessage('s',(m:any)=>applySnap(s,m));room.onMessage('c',(a:number[])=>{s.calls=new Set(a)});room.onMessage('sum',(d:any)=>{sumData=d;if(s.over)showSummary()});
 room.onMessage('btr',(m:any)=>{if(m.k!==undefined&&m.txt){banterMsg[m.k]=m.txt;banterTime[m.k]=Date.now()+2500;banterSprites[m.k].material.map=banterTex(m.txt);banterSprites[m.k].material.needsUpdate=true}});
 room.onMessage('cfg',(c:any)=>{lob=c;if(c.phase==='play'){look(c.field,c.teams);$('menu').className='hide';inMenu=false}else{inMenu=true;show('lobby')}});
 room.onLeave(async(code:number)=>{if(online!==room)return;if(code===1000||code===4000){online=null;lob=null;show('modes');return}
  for(let i=0;i<10;i++){$('msg').innerHTML='<span class="pop">RECONNECTING...</span>';await new Promise(r=>setTimeout(r,3000));try{wire(await reconnect());return}catch(e){}}
  shown='';online=null;lob=null;show('modes')});
 room.send('ready')}
async function goOnline(code:string,how:string){const e:any=document.getElementById('oe')||{};e.textContent='Connecting...';
 try{s=mk();wire(await connect(nick,(code||'').toUpperCase().replace(/[^A-Z0-9]/g,'')||'QUICK',how))}
 catch(x){if(!document.getElementById('oe'))show('online');e.textContent=how==='join'?'Room not found, or the match already started.':'Could not connect. Is the server running?'}}
function sendIn(o:any,t:number){const j=JSON.stringify(o);if(j!==lastIn||t-lastSend>100||o.shoot){lastIn=j;lastSend=t;online.send('in',o)}}
if(location.search.includes('debug'))(window as any).__sfc={start,showSummary,get s(){return s}}; // debug hook for automated screenshots (only with ?debug)
requestAnimationFrame(loop);
