import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {requestJSON} from '../dist/loading.js';

const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
const bootstrap=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
function startup({seen=false,reduced=false,hash='',english=false,storageFails=false}={}) {
  const classes=new Set(),listeners=new Map(),timers=new Map();let nextTimer=0;
  const root={dataset:{},classList:{add:(...items)=>items.forEach(item=>classes.add(item)),remove:(...items)=>items.forEach(item=>classes.delete(item))}};
  const events={addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:(type,fn)=>{if(listeners.get(type)===fn)listeners.delete(type);}};
  const storage={getItem:key=>{if(storageFails)throw Error('Denied');return key==='waypoint-welcome'&&seen?'seen':key==='waypoint-language'&&english?'en':null;},setItem:()=>{}};
  runInNewContext(bootstrap,{document:{documentElement:root,...events},localStorage:storage,sessionStorage:storage,matchMedia:()=>({matches:reduced,...events}),location:{hash},setTimeout:fn=>{const id=++nextTimer;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)});
  return {root,classes,listeners,timers};
}

test('the first homepage is gated synchronously before the main module can run',()=>{
  const first=startup();assert.equal(first.classes.has('intro-pending'),true);
  assert.equal(first.timers.size,1);
  assert.match(html,/intro-pending:not\(\.intro-leaving\) body>:not\(\.welcome-screen\)\{visibility:hidden\}/);
  assert.match(html,/<span data-welcome="zh">你好<\/span>/);
  assert.match(html,/<span data-welcome="en">Hello<\/span>/);
  assert.equal(startup({english:true}).root.dataset.language,'en');
});
test('repeat visits, reduced motion, and direct content links bypass the greeting',()=>{
  for(const options of [{seen:true},{reduced:true},{hash:'#entry/article-example'},{hash:'#races'}]) {
    const state=startup(options);assert.equal(state.classes.has('intro-pending'),false);assert.equal(state.classes.has('intro-complete'),true);assert.equal(state.timers.size,0);
  }
});
test('storage denial cannot trap a visitor, and missing modules have a fail-open deadline',()=>{
  const state=startup({storageFails:true});assert.equal(state.classes.has('intro-pending'),true);
  [...state.timers.values()][0]();assert.equal(state.classes.has('intro-pending'),false);assert.equal(state.classes.has('intro-complete'),true);
  assert.equal(state.listeners.has('keydown'),false);
});
test('keyboard skip releases the gate and module ownership cancels the bootstrap deadline',()=>{
  const skip=startup();skip.listeners.get('keydown')({type:'keydown'});assert.equal(skip.classes.has('intro-pending'),false);assert.equal(skip.root.dataset.input,'keyboard');assert.equal(skip.timers.size,0);
  const ready=startup();ready.listeners.get('waypoint-welcome-ready')();assert.equal(ready.timers.size,0);assert.equal(ready.classes.has('intro-pending'),true);
});
test('request deadlines include a response body that never finishes',async t=>{
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
  let aborted=false;
  globalThis.fetch=async(_,options)=>({ok:true,json:()=>new Promise((_,reject)=>options.signal.addEventListener('abort',()=>{aborted=true;reject(new DOMException('Aborted','AbortError'));},{once:true}))});
  await assert.rejects(requestJSON('/api/entries',{},15),/request_timeout/);assert.equal(aborted,true);
});
test('API errors retain their identity and writes are never replayed',async t=>{
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});let calls=0;
  globalThis.fetch=async()=>{calls++;return {ok:false,json:async()=>({error:'owner_required'})};};
  await assert.rejects(requestJSON('/api/manage/entries/item',{method:'PUT'}),/owner_required/);assert.equal(calls,1);
});
test('invalid JSON becomes a recoverable error and successful reads return all content',async t=>{
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
  globalThis.fetch=async()=>({ok:true,json:async()=>{throw new SyntaxError('Invalid JSON');}});await assert.rejects(requestJSON('/api/entries'),/unavailable/);
  globalThis.fetch=async()=>({ok:true,json:async()=>({entries:[{id:'article',bodyZh:'完整正文'}]})});assert.equal((await requestJSON('/api/entries')).entries[0].bodyZh,'完整正文');
});
