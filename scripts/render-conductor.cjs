#!/usr/bin/env node
'use strict';
// Adapted from Wilf's original 8-second Codex orchestration canvas artwork.
// Preserve its independent schedules, role/model labels and review dependencies.
// Original source: 2026-10-02 Codex orchestration artwork, work/motion/render-short.cjs.
// The longer render.cjs and make_english.py supply authored bilingual terminology.
// Canvas and ffmpeg are build-time tools only. No runtime web dependency is added.
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {once} = require('node:events');
function options(argv) {
 const result={locale:'all',out:'dist/assets/conductor',work:'verification/conductor-assets',canvas:process.env.CONDUCTOR_CANVAS_MODULE||'@napi-rs/canvas',ffmpeg:process.env.CONDUCTOR_FFMPEG||'ffmpeg',colors:64,fps:20,stills:false};
 const keys={'--locale':'locale','--out':'out','--work':'work','--canvas-module':'canvas','--ffmpeg':'ffmpeg','--palette-colors':'colors','--fps':'fps'};
 for(let i=0;i<argv.length;i++){const flag=argv[i];if(flag==='--help'){console.log('Usage: node scripts/render-conductor.cjs [--locale all|zh|en] [--out DIR] [--work DIR] [--canvas-module MODULE] [--ffmpeg BIN] [--palette-colors 32..256] [--fps 10|20|25] [--stills]\nEnvironment: CONDUCTOR_CANVAS_MODULE, CONDUCTOR_FFMPEG');process.exit(0);}if(flag==='--stills'){result.stills=true;continue;}if(!keys[flag]||!argv[i+1])throw Error('Unknown or incomplete option: '+flag);result[keys[flag]]=argv[++i];}
 result.colors=Number(result.colors);result.fps=Number(result.fps);
 if(!['all','zh','en'].includes(result.locale)||!Number.isInteger(result.colors)||result.colors<32||result.colors>256||![10,20,25].includes(result.fps))throw Error('Invalid locale, palette colors, or GIF frame rate');
 return result;
}
const OPTIONS=options(process.argv.slice(2));
const {createCanvas}=require(OPTIONS.canvas);
const sharp=require('sharp');
const W=1200,H=1500,DURATION=8,FPS=OPTIONS.fps;
const OUT=path.resolve(OPTIONS.out),WORK=path.resolve(OPTIONS.work),FFMPEG=OPTIONS.ffmpeg;
const FONT_FAMILY='"Avenir Next", "Hiragino Sans GB", "PingFang SC", sans-serif';
const canvas=createCanvas(W,H),ctx=canvas.getContext('2d');
let locale='en';
const ZH={
 'QUALITY FIRST':'质量优先',
 'Independent work in parallel. One accountable main session.':'独立任务并行推进，主会话统一负责交付。',
 'CONFIGURED AGENT SYSTEM':'按需协作系统',
 'Your request':'你的需求',
 'Small tasks · Direct completion':'简单任务 · 直接完成',
 'Independent review':'独立审查',
 'On call · Reports to main':'按需介入 · 返回主会话',
 'Major plans':'重大方案',
 'Before implementation':'实施前审查',
 'Repeat failures':'同类失败重复',
 'After a real fix':'实质修复之后',
 'Before handoff':'较大任务交付前',
 'Substantial tasks':'核对完成证据',
 'Reviews · Never edits':'只审查 · 不改代码',
 'Main session':'主会话',
 'Plan · Delegate · Verify · Deliver':'规划 · 委派 · 验证 · 交付',
 'Coordinating independent work':'统筹独立任务',
 'Code evidence':'代码取证',
 'Primary sources':'一手资料核查',
 'Build · Verify':'实现与验证',
 'When needed: Sol / xhigh · Read-only investigation':'按需升级：Sol / xhigh · 复杂只读调查',
 'Main session · Integrate & verify':'主会话 · 整合与验证',
 'All evidence and results return here':'汇总证据 · 处理发现 · 验证交付',
 'PARALLEL ACTIVITY':'并行协作',
 'Work stays scoped. Related dependencies stay ordered.':'各自负责明确范围，相关依赖按顺序推进。',
 'CODE':'代码取证',
 'DOCS':'资料核查',
 'WORK / REVIEW':'实现 / 审查',
 'On demand · Other independent work continues during review':'按需协作 · 审查期间，其它独立工作继续',
 'Workflow demo / 8s LOOP':'协作演示 / 8秒循环',
 'REVIEWING':'正在审查',
 'WHEN NEEDED':'按需介入',
 'Investigating':'只读调查',
 'Awaiting review':'等待方案审查',
 'Implementing':'正在实现',
 'Fix & recheck':'修复与复验',
 'Review pending':'等待复核',
 'Fix & verify':'修复与验证',
 'Final review':'等待交付审查',
 'On call':'待命',
 'Major plan review':'重大方案审查',
 'Recheck diagnosis':'重新核对诊断',
 'Completion review':'完成证据审查',
 'Reading code':'阅读代码',
 'Checking sources':'核对资料',
 'Evidence flowing':'返回代码证据',
 'Sources returning':'返回资料出处'
};
const IDENTITIES=new Set(['Conductor Mode','WILF / CODEX','Architect','Explorer','Researcher','Worker','GPT-6 Astra','GPT-6.1 Sol','GPT-5.6 Luna','max','xhigh','high']);
function translate(text){if(locale==='en'||IDENTITIES.has(text))return text;if(!Object.hasOwn(ZH,text))throw Error('Missing Chinese caption: '+text);return ZH[text];}
const C={bg:'#070b14',line:'#223347',white:'#eaf3ff',muted:'#9aaac0',faint:'#61748e',cyan:'#7ce9fa',blue:'#78abff',purple:'#c2a3ff',green:'#7de6bc',amber:'#f4cd8e'};
function rgba(hex,a){let h=hex.slice(1);return `rgba(${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)},${a})`;}
const clamp=x=>Math.max(0,Math.min(1,x));
// Strong ease-out for stage entrances: cubic-bezier(0.23,1,0.32,1).
function easeOut(x){x=clamp(x);let lo=0,hi=1,u=x;for(let i=0;i<16;i++){u=(lo+hi)/2;let q=3*(1-u)*(1-u)*u*.23+3*(1-u)*u*u*.32+u*u*u;if(q<x)lo=u;else hi=u;}return 3*(1-u)*(1-u)*u+3*(1-u)*u*u+u*u*u;}
const nodes={main:{x:545,y:328,w:440,h:216,color:C.cyan},architect:{x:76,y:340,w:282,h:773,color:C.purple},explorer:{x:410,y:649,w:220,h:265,color:C.cyan},researcher:{x:655,y:649,w:220,h:265,color:C.cyan},worker:{x:900,y:649,w:220,h:265,color:C.blue},result:{x:545,y:994,w:440,h:136,color:C.green}};
// All data paths travel through the main session. Architect never edits code.
const curves={
 explore:[[765,544],[765,612],[520,581],[520,649]],
 research:[[765,544],[765,584],[765,609],[765,649]],
 work:[[765,544],[765,612],[1010,581],[1010,649]],
 plan:[[545,426],[473,426],[430,426],[358,426]],
 planReturn:[[545,474],[478,474],[425,474],[358,474]],
 simple:[[985,427],[1164,427],[1164,1062],[985,1062]],
 explorerResult:[[520,914],[520,967],[696,952],[696,994]],
 researcherResult:[[765,914],[765,944],[765,963],[765,994]],
 workerResult:[[1010,914],[1010,967],[834,952],[834,994]],
 finalReview:[[358,1062],[426,1062],[478,1062],[545,1062]],
 delivery:[[985,1093],[1188,1093],[1188,468],[985,468]]
};
function bpoint(p,t){let q=1-t;return [q*q*q*p[0][0]+3*q*q*t*p[1][0]+3*q*t*t*p[2][0]+t*t*t*p[3][0],q*q*q*p[0][1]+3*q*q*t*p[1][1]+3*q*t*t*p[2][1]+t*t*t*p[3][1]];}
function pathCurve(p){ctx.beginPath();ctx.moveTo(...p[0]);ctx.bezierCurveTo(...p[1],...p[2],...p[3]);}
function rr(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
const textFits=new Map();
function txt(s,x,y,size=24,color=C.white,weight=400,align='left',maxWidth=Infinity){
 s=translate(s); let actual=size;ctx.font=`${weight} ${actual}px ${FONT_FAMILY}`;
 let w=ctx.measureText(s).width;
 if(w>maxWidth){actual=Math.floor(size*maxWidth/w*10)/10;ctx.font=`${weight} ${actual}px ${FONT_FAMILY}`;}
 if(maxWidth!==Infinity&&actual<Math.min(size,17))throw new Error('Label would be too small: '+s+' / '+actual);
 const measured=ctx.measureText(s).width; const left=align==='center'?x-measured/2:align==='right'?x-measured:x;
 const transform=ctx.getTransform();
 for(const [localX,localY] of [[left,y-actual],[left+measured,y-actual],[left,y+actual*.2],[left+measured,y+actual*.2]]){const globalX=transform.a*localX+transform.c*localY+transform.e,globalY=transform.b*localX+transform.d*localY+transform.f;if(globalX<0||globalX>W||globalY<0||globalY>H)throw Error('Text outside canvas: '+s); }
 textFits.set(s,{requested:size,actual,width:measured,maxWidth:Number.isFinite(maxWidth)?maxWidth:null});
 ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline='alphabetic';ctx.fillText(s,x,y);
}
function spaced(s,x,y,size,color,spacing=3){s=translate(s);ctx.font=`500 ${size}px ${FONT_FAMILY}`;ctx.fillStyle=color;ctx.textAlign='left';for(let ch of s){ctx.fillText(ch,x,y);x+=ctx.measureText(ch).width+spacing;}}
function pill(s,x,y,w,color=C.cyan,size=19){ctx.save();rr(x,y,w,34,17);ctx.fillStyle=rgba(color,.1);ctx.fill();ctx.strokeStyle=rgba(color,.22);ctx.lineWidth=1;ctx.stroke();txt(s,x+w/2,y+24,size,color,500,'center',w-24);ctx.restore();}
function icon(type,x,y,color,t=0,active=0){ctx.save();ctx.translate(x,y);ctx.strokeStyle=color;ctx.lineWidth=2.2;ctx.lineCap='round';ctx.lineJoin='round';
 if(type==='main'){ctx.rotate(Math.PI/4);rr(-13,-13,26,26,5);ctx.stroke();rr(-6,-6,12,12,2);ctx.stroke();for(let a=0;a<4;a++){ctx.rotate(Math.PI/2);ctx.beginPath();ctx.moveTo(0,17);ctx.lineTo(0,22);ctx.stroke();}}
 if(type==='architect'){ctx.beginPath();ctx.moveTo(0,-18);ctx.lineTo(16,-10);ctx.lineTo(13,9);ctx.quadraticCurveTo(8,15,0,20);ctx.quadraticCurveTo(-8,15,-13,9);ctx.lineTo(-16,-10);ctx.closePath();ctx.stroke();ctx.beginPath();ctx.moveTo(-6,0);ctx.lineTo(-1,5);ctx.lineTo(8,-5);ctx.stroke();}
 if(type==='explorer'){ctx.beginPath();ctx.arc(-3,-3,12,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(6,6);ctx.lineTo(17,17);ctx.stroke();ctx.beginPath();ctx.moveTo(-8,-3);ctx.lineTo(2,-3);ctx.moveTo(-3,-8);ctx.lineTo(-3,2);ctx.stroke();}
 if(type==='researcher'){ctx.beginPath();ctx.moveTo(-15,13);ctx.lineTo(-15,-13);ctx.quadraticCurveTo(-6,-17,0,-12);ctx.quadraticCurveTo(6,-17,15,-13);ctx.lineTo(15,13);ctx.quadraticCurveTo(6,9,0,14);ctx.quadraticCurveTo(-6,9,-15,13);ctx.moveTo(0,-12);ctx.lineTo(0,14);ctx.stroke();}
 if(type==='worker'){ctx.beginPath();ctx.moveTo(-8,-11);ctx.lineTo(-19,0);ctx.lineTo(-8,11);ctx.moveTo(8,-11);ctx.lineTo(19,0);ctx.lineTo(8,11);ctx.moveTo(4,-15);ctx.lineTo(-4,15);ctx.stroke();}
 if(type==='result'){ctx.beginPath();ctx.arc(0,0,17,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(-8,0);ctx.lineTo(-2,6);ctx.lineTo(9,-6);ctx.stroke();}
 ctx.restore();}
function card(n,active=0){ctx.save();let {x,y,w,h,color}=n;
 if(active){ctx.shadowColor=rgba(color,.25*active);ctx.shadowBlur=25;rr(x,y,w,h,22);ctx.fillStyle='#0d1624';ctx.fill();ctx.shadowBlur=0;}
 let g=ctx.createLinearGradient(x,y,x+w,y+h);g.addColorStop(0,'#121c2a');g.addColorStop(1,'#0b111d');rr(x,y,w,h,22);ctx.fillStyle=g;ctx.fill();ctx.lineWidth=1.5;ctx.strokeStyle=rgba(active?color:'#7186a3',active?.25+.4*active:.2);ctx.stroke();
 ctx.strokeStyle=rgba(color,.16+.55*active);ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+24,y);ctx.lineTo(x+70,y);ctx.moveTo(x+w-24,y+h);ctx.lineTo(x+w-70,y+h);ctx.stroke();ctx.restore();}
function packet(id,color,reverse,t,alpha=1,index=0){let p=curves[id];if(!p)return;let u=((t*.5+index*.47)%1);let v=reverse?1-u:u;
 ctx.save();ctx.globalAlpha=alpha;let end=bpoint(p,v);ctx.strokeStyle=rgba(color,.7);ctx.lineWidth=2.4;ctx.shadowColor=color;ctx.shadowBlur=12;
 ctx.beginPath();for(let k=0;k<=22;k++){let q=clamp(v+(reverse?1:-1)*.12*(1-k/22));let point=bpoint(p,q);if(k===0)ctx.moveTo(...point);else ctx.lineTo(...point);}ctx.stroke();ctx.fillStyle=color;ctx.beginPath();ctx.arc(...end,4.3,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle=C.white;ctx.beginPath();ctx.arc(...end,1.8,0,Math.PI*2);ctx.fill();
 // Arrowhead establishes direction independent of motion.
 let pp=bpoint(p,clamp(v+(reverse?.012:-.012))),a=Math.atan2(end[1]-pp[1],end[0]-pp[0]);ctx.translate(...end);ctx.rotate(a);ctx.strokeStyle=color;ctx.lineWidth=1.7;ctx.beginPath();ctx.moveTo(-9,-5);ctx.lineTo(-3,0);ctx.lineTo(-9,5);ctx.stroke();ctx.restore();}
function status(s,x,y,color,active=0,maxWidth=370){ctx.fillStyle=rgba(color,.3+.7*active);ctx.beginPath();ctx.arc(x,y-6,3,0,Math.PI*2);ctx.fill();txt(s,x+12,y,20,active?color:C.muted,400,'left',maxWidth);}
// Independent schedules, not global chapters. A review pauses only its related worker task.
// Compress the state schedule to 8 seconds; packet travel keeps its original 2-second period.
function scheduleTime(t){return t*3;}
function phase(t,period,offset=0){return ((t+offset)%period+period)%period;}
function envelope(p,start,end,fade=.6){return easeOut((p-start)/fade)*easeOut((end-p)/fade);}
function workState(t){
 if(t<4.4)return {active:envelope(t,0,4.4),readOnly:true,status:'Investigating',returning:t>2.1};
 if(t<7.2)return {active:0,status:'Awaiting review',waiting:true};
 if(t<11.7)return {active:envelope(t,7.2,11.7),status:t<9.5?'Implementing':'Fix & recheck',returning:t>10.7};
 if(t<14.6)return {active:0,status:'Review pending',waiting:true};
 if(t<19.3)return {active:envelope(t,14.6,19.3),status:'Fix & verify',returning:t>17.6};
 if(t<21.9)return {active:0,status:'Final review',waiting:true};
 return {active:0,status:'On call'};
}
function reviewState(t){
 for(let [start,end,trigger,status] of [[4.8,7,0,'Major plan review'],[12,14.4,1,'Recheck diagnosis'],[19.5,21.8,2,'Completion review']]){
  if(t>=start&&t<end)return {active:envelope(t,start,end),trigger,status,elapsed:t-start};
 }
 return {active:0,trigger:-1,status:'On call',elapsed:0};
}
function channelState(t,period,offset,role){
 let p=phase(t,period,offset),end=period-1.5,active=envelope(p,0,end);
 return {p,active,dispatch:p<end-.6&&active>.01,returning:p>1.4&&p<end&&active>.01,status:active<.01?'On call':p<1.4?(role==='code'?'Reading code':'Checking sources'):(role==='code'?'Evidence flowing':'Sources returning')};
}
function validateRouting(){
 let max=0,reviewSamples=0,parallelSamples=0,otherWorkDuringReview=0;
 for(let frame=0;frame<DURATION*FPS;frame++){
  let t=frame/FPS,s=scheduleTime(t),e=channelState(s,6,.8,'code'),r=channelState(s,8,3.5,'docs'),w=workState(s),a=reviewState(s);
  let count=[e.active,r.active,w.active,a.active].filter(v=>v>.01).length;max=Math.max(max,count);
  if(count>3)throw Error('Too many simultaneous specialist agents at '+t);
  if(a.active>.01){reviewSamples++;if(w.active)throw Error('Related worker is implementing during review');if(e.active>.01||r.active>.01)otherWorkDuringReview++;}
  if(count>=2)parallelSamples++;
 }
 return {duration:DURATION,maxSimultaneousSpecialists:max,parallelFrameFraction:parallelSamples/(DURATION*FPS),reviewFrames:reviewSamples,otherWorkContinuesDuringReview:otherWorkDuringReview===reviewSamples,globalChapters:false,modelRouting:'unchanged'};
}
function draw(t){t=phase(t,DURATION);let s=scheduleTime(t),e=channelState(s,6,.8,'code'),r=channelState(s,8,3.5,'docs'),w=workState(s),a=reviewState(s);
 ctx.clearRect(0,0,W,H);ctx.fillStyle=C.bg;ctx.fillRect(0,0,W,H);
 let g=ctx.createRadialGradient(770,510,50,770,510,690);g.addColorStop(0,'rgba(54,118,160,.09)');g.addColorStop(1,'rgba(54,118,160,0)');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
 g=ctx.createRadialGradient(85,660,0,85,660,420);g.addColorStop(0,'rgba(105,65,190,.065)');g.addColorStop(1,'rgba(105,65,190,0)');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
 ctx.strokeStyle='rgba(92,123,163,.045)';ctx.lineWidth=1;for(let x=40;x<W;x+=40){ctx.beginPath();ctx.moveTo(x,245);ctx.lineTo(x,1155);ctx.stroke();}for(let y=260;y<1155;y+=40){ctx.beginPath();ctx.moveTo(48,y);ctx.lineTo(W-48,y);ctx.stroke();}
 for(let q=0;q<65;q++){let x=50+((q*193)%1100),y=80+((q*137)%1340);ctx.fillStyle=rgba('#90b4d6',q%3===0?.14:.06);ctx.fillRect(x,y,1.6,1.6);}
 spaced('WILF / CODEX',76,84,19,C.muted,4);pill('QUALITY FIRST',904,60,216,C.cyan,17);
 txt('Conductor Mode',76,170,55,C.white,500,'left',1044);
 txt('Independent work in parallel. One accountable main session.',78,216,25,C.muted,400,'left',1042);
 ctx.strokeStyle=rgba('#7186a3',.2);ctx.beginPath();ctx.moveTo(76,250);ctx.lineTo(1120,250);ctx.stroke();
 spaced('CONFIGURED AGENT SYSTEM',76,284,15,C.faint,2.7);
 pill('Your request',663,274,205,C.cyan,21);ctx.strokeStyle=rgba(C.cyan,.3);ctx.beginPath();ctx.moveTo(765,308);ctx.lineTo(765,328);ctx.stroke();
 for(let [id,p] of Object.entries(curves)){pathCurve(p);ctx.strokeStyle=rgba(id.startsWith('plan')||id==='finalReview'?C.purple:'#7591b4',id==='simple'||id==='delivery'?.12:.25);ctx.lineWidth=1.5;ctx.stroke();}
 ctx.save();ctx.translate(1143,744);ctx.rotate(Math.PI/2);txt('Small tasks · Direct completion',0,0,18,C.faint,400,'center');ctx.restore();
 // Three streams exchange different chunks independently, with results going back to the parent.
 if(e.dispatch){packet('explore',C.cyan,false,t,.95*e.active,.11);packet('explore',C.cyan,false,t,.35*e.active,.61);}
 if(e.returning)packet('explorerResult',C.cyan,false,t,.85*e.active,.37);
 if(r.dispatch){packet('research',C.cyan,false,t,.95*r.active,.77);packet('research',C.cyan,false,t,.35*r.active,.21);}
 if(r.returning)packet('researcherResult',C.cyan,false,t,.85*r.active,.82);
 if(w.active){packet('work',C.blue,false,t,.95*w.active,.44);packet('work',C.blue,false,t,.36*w.active,.94);}
 if(w.returning)packet('workerResult',C.blue,false,t,.95*w.active,.19);
 if(a.active){
  let id=a.trigger===2?'finalReview':'plan',reverse=a.trigger===2;
  packet(id,C.purple,reverse,t,a.active,.53);
  if(a.trigger===2)packet('finalReview',C.purple,false,t,a.active,.12);
  else packet('planReturn',C.purple,true,t,a.active,.04);
 }
 // Independent simple requests and integrated results can continue alongside specialist work.
 let simple=phase(t,4,2);if(simple<2.6)packet('simple',C.cyan,false,t,.5,.63);
 packet('delivery',C.green,true,t,.5,.32);
 let pulse=.82+.12*Math.sin(t*Math.PI/2);
 // The Architect is on call, never a permanently running fourth specialist.
 card(nodes.architect,a.active);icon('architect',111,384,C.purple);txt('Architect',148,392,29,C.white,500,'left',186);txt('GPT-6 Astra',100,441,28,C.white,500,'left',234);pill('high',100,462,81,C.purple);
 txt('Independent review',100,534,27,C.white,500,'left',234);txt('On call · Reports to main',100,569,20,C.muted,400,'left',234);
 let triggers=[['Major plans','Before implementation',636],['Repeat failures','After a real fix',785],['Before handoff','Substantial tasks',934]];
 ctx.strokeStyle=rgba(C.purple,.22);ctx.beginPath();ctx.moveTo(110,620);ctx.lineTo(110,982);ctx.stroke();
 triggers.forEach(([title,detail,y],k)=>{let ac=a.trigger===k&&a.active>.01;ctx.fillStyle=ac?C.purple:'#182238';ctx.beginPath();ctx.arc(110,y-6,ac?6:4,0,Math.PI*2);ctx.fill();if(ac){ctx.strokeStyle=rgba(C.purple,.23*a.active);ctx.beginPath();ctx.arc(110,y-6,14,0,Math.PI*2);ctx.stroke();}
  txt(ac?'REVIEWING':'WHEN NEEDED',132,y-35,14,ac?C.purple:C.faint,500);
  txt(title,132,y,24,ac?C.white:C.muted,ac?500:400,'left',202);txt(detail,132,y+36,19,ac?C.purple:C.faint,400,'left',202);
 });
 ctx.strokeStyle=rgba(C.purple,.17);ctx.beginPath();ctx.moveTo(100,1038);ctx.lineTo(334,1038);ctx.stroke();txt('Reviews · Never edits',100,1080,21,C.muted,400,'left',234);
 card(nodes.main,pulse);icon('main',583,367,C.cyan);txt('Main session',620,375,26,C.white,500,'left',233);pill('max',877,348,84,C.cyan);txt('GPT-6.1 Sol',573,426,40,C.white,500,'left',384);txt('Plan · Delegate · Verify · Deliver',573,468,23,C.muted,400,'left',384);status('Coordinating independent work',574,518,C.cyan,.85);
 for(let [id,title,model,effort,desc,state] of [ ['explorer','Explorer','GPT-5.6 Luna','max','Code evidence',e], ['researcher','Researcher','GPT-5.6 Luna','max','Primary sources',r], ['worker','Worker','GPT-6.1 Sol','xhigh','Build · Verify',w] ]){
  let n=nodes[id],ac=state.active*(.82+.12*Math.sin(t*Math.PI/2+(id==='researcher'?2:0)));card(n,ac);icon(id,n.x+36,n.y+39,n.color);txt(title,n.x+24,n.y+91,id==='researcher'?27:29,C.white,500,'left',n.w-48);txt(model,n.x+24,n.y+130,23,C.white,500,'left',n.w-48);pill(effort,n.x+24,n.y+150,effort==='xhigh'?88:74,n.color,18);txt(desc,n.x+24,n.y+214,22,C.muted,400,'left',n.w-48);
  status(state.status,n.x+25,n.y+246,w.waiting&&id==='worker'?C.purple:n.color,ac,n.w-61);
 }
 // This is a capability label, not another chapter or a mandatory step.
 rr(504,558,522,34,17);ctx.fillStyle='#0d1623';ctx.fill();
 txt('When needed: Sol / xhigh · Read-only investigation',765,582,18,C.muted,400,'center',494);
 let receiving=Math.max(e.returning?e.active:0,r.returning?r.active:0,w.returning?1:0);
 card(nodes.result,.35+.45*receiving);icon('result',584,1037,C.green);txt('Main session · Integrate & verify',622,1045,27,C.white,500,'left',339);
 txt('All evidence and results return here',573,1092,23,C.muted,400,'left',384);
 // Independent activity rows replace the serial chapter panel and segmented progress bar.
 rr(76,1182,1044,182,22);ctx.fillStyle='#101825';ctx.fill();ctx.strokeStyle=rgba('#8ca6c8',.16);ctx.lineWidth=1;ctx.stroke();
 txt('PARALLEL ACTIVITY',103,1224,18,C.cyan,500);txt('Work stays scoped. Related dependencies stay ordered.',103,1263,24,C.white,500,'left',990);
 let activity=[['CODE',e.status,C.cyan,e.active],['DOCS',r.status,C.cyan,r.active],['WORK / REVIEW',a.active>.01?a.status:w.status,a.active>.01?C.purple:C.blue,Math.max(a.active,w.active)]];
 activity.forEach(([label,st,color,ac],k)=>{let x=103+k*336;txt(label,x,1305,15,C.faint,500);status(st,x,1337,color,ac,289);});
 txt('On demand · Other independent work continues during review',76,1435,19,C.muted,400,'left',730);
 txt('Workflow demo / 8s LOOP',1120,1435,17,C.faint,400,'right');
}
function validatePaths(){
 const routes={explore:['main','explorer'],research:['main','researcher'],work:['main','worker'],plan:['main','architect'],planReturn:['main','architect'],simple:['main','result'],explorerResult:['explorer','result'],researcherResult:['researcher','result'],workerResult:['worker','result'],finalReview:['architect','result'],delivery:['result','main']};
 function onBoundary(point,n){const [x,y]=point;return x>=n.x&&x<=n.x+n.w&&y>=n.y&&y<=n.y+n.h&&(x===n.x||x===n.x+n.w||y===n.y||y===n.y+n.h);}
 for(const [id,[from,to]]of Object.entries(routes)){const p=curves[id];if(!onBoundary(p[0],nodes[from])||!onBoundary(p[3],nodes[to]))throw Error('Invalid route endpoint: '+id);for(const [x,y]of p){if(x<0||x>W||y<0||y>H)throw Error('Route leaves artwork: '+id);}if(!['main','result'].includes(from)&&!['main','result'].includes(to))throw Error('Specialists bypass main: '+id);}
 return{validatedRoutes:Object.keys(routes).length,allSpecialistOutputsReturnToMain:true,architectNeverEdits:true};
}
async function encode(args,logPath,renderFrames=false){
 const log=fs.openSync(logPath,'w');const encoder=spawn(FFMPEG,args,{stdio:[renderFrames?'pipe':'ignore','ignore',log]});fs.closeSync(log);const completion=once(encoder,'close');
 if(renderFrames){encoder.stdin.on('error',()=>{});for(let frame=0;frame<DURATION*FPS;frame++){draw(frame/FPS);if(!encoder.stdin.write(canvas.data()))await Promise.race([once(encoder.stdin,'drain'),completion.then(([code])=>{throw Error('Encoder stopped before all frames: '+code);})]);}encoder.stdin.end();}
 const[code]=await completion;if(code!==0)throw Error('ffmpeg failed ('+code+'); see '+logPath);
}
async function main(){
 fs.mkdirSync(OUT,{recursive:true});fs.mkdirSync(WORK,{recursive:true});
 const routing={...validateRouting(),...validatePaths(),frames:DURATION*FPS,fps:FPS,width:W,height:H};
 fs.writeFileSync(path.join(WORK,'routing-check.json'),JSON.stringify(routing,null,2)+'\n');
 const reports=[];
 for(const language of OPTIONS.locale==='all'?['zh','en']:[OPTIONS.locale]){
  locale=language;textFits.clear();const temp=path.join(WORK,language);fs.mkdirSync(temp,{recursive:true});
  for(const t of[0,.4,1.2,1.85,2.8,3.5,4.35,5.3,6.25,6.9,7.65]){draw(t);fs.writeFileSync(path.join(temp,`frame-${t}.png`),canvas.toBuffer('image/png'));}
  draw(2.8);const poster=path.join(OUT,`conductor-${language}.webp`);await sharp(canvas.toBuffer('image/png')).webp({lossless:true,effort:6}).toFile(poster);
  const textReport={locale:language,labels:Object.fromEntries(textFits),minimumFittedTextSize:Math.min(...[...textFits.values()].map(x=>x.actual)),completeTranslation:true};fs.writeFileSync(path.join(temp,'text-fit.json'),JSON.stringify(textReport,null,2)+'\n');
  if(OPTIONS.stills){reports.push({locale:language,poster,posterBytes:fs.statSync(poster).size,stillsOnly:true});continue;}
  const intermediate=path.join(temp,'intermediate.mp4'),palette=path.join(temp,'palette.png'),pendingGif=path.join(temp,'encoded.gif'),gif=path.join(OUT,`conductor-${language}.gif`);
  await encode(['-y','-f','rawvideo','-pixel_format','rgba','-video_size',`${W}x${H}`,'-framerate',String(FPS),'-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','16','-pix_fmt','yuv420p',intermediate],path.join(temp,'video.log'),true);
  await encode(['-y','-i',intermediate,'-vf',`palettegen=max_colors=${OPTIONS.colors}:stats_mode=diff`,'-frames:v','1',palette],path.join(temp,'palette.log'));
  await encode(['-y','-i',intermediate,'-i',palette,'-lavfi','paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle','-gifflags','+transdiff','-loop','0',pendingGif],path.join(temp,'gif.log'));
  const metadata=await sharp(pendingGif).metadata(),dur=(metadata.delay||[]).reduce((a,b)=>a+b,0)/1000;
  if(metadata.width!==W||metadata.height!==H||metadata.pages!==DURATION*FPS||dur!==DURATION||metadata.loop!==0)throw Error('GIF dimensions, frame count, duration or infinite loop mismatch');
  fs.renameSync(pendingGif,gif);
  textReport.labels=Object.fromEntries(textFits);textReport.minimumFittedTextSize=Math.min(...[...textFits.values()].map(x=>x.actual));textReport.fullTimelineValidated=true;fs.writeFileSync(path.join(temp,'text-fit.json'),JSON.stringify(textReport,null,2)+'\n');
  await sharp(gif,{page:Math.round(2.8*FPS)}).png().toFile(path.join(temp,'encoded-frame-2.8.png'));
  reports.push({locale:language,gif:path.relative(process.cwd(),gif),gifBytes:fs.statSync(gif).size,poster:path.relative(process.cwd(),poster),posterBytes:fs.statSync(poster).size,width:metadata.width,height:metadata.height,frames:metadata.pages,fps:FPS,durationSeconds:dur,loop:metadata.loop,paletteColors:OPTIONS.colors});console.log(JSON.stringify(reports.at(-1)));
 }
 fs.writeFileSync(path.join(WORK,'assets.json'),JSON.stringify({generatedAt:new Date().toISOString(),provenance:'Adapted native canvas from Wilf original render-short.cjs; terms checked against render.cjs/make_english.py; original artifacts unchanged.',routing,assets:reports},null,2)+'\n');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
