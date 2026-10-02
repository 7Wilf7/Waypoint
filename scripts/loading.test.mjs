import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {requestJSON} from '../dist/loading.js';

const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
const bootstrap=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
function startup({seen=false,reduced=false,hash='',english=false,theme=null,storageFails=false}={}) {
  const classes=new Set(),listeners=new Map(),timers=new Map();let nextTimer=0;
  const root={dataset:{theme:'dark',language:'zh'},lang:'zh-CN',classList:{add:(...items)=>items.forEach(item=>classes.add(item)),remove:(...items)=>items.forEach(item=>classes.delete(item))}};
  const events={addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:(type,fn)=>{if(listeners.get(type)===fn)listeners.delete(type);}};
  const storage={getItem:key=>{if(storageFails)throw Error('Denied');return key==='waypoint-theme'?theme:key==='waypoint-welcome'&&seen?'seen':key==='waypoint-language'&&english?'en':null;},setItem:()=>{}};
  runInNewContext(bootstrap,{document:{documentElement:root,...events},localStorage:storage,sessionStorage:storage,matchMedia:()=>({matches:reduced,...events}),location:{hash},setTimeout:fn=>{const id=++nextTimer;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)});
  return {root,classes,listeners,timers};
}

test('the homepage is visible immediately with no blocking greeting deadline',()=>{
  const first=startup();assert.equal(first.classes.has('intro-pending'),false);
  assert.equal(first.classes.has('intro-complete'),true);
  assert.equal(first.timers.size,0);
  assert.equal(first.listeners.size,0);
  assert.doesNotMatch(html,/intro-pending[^}]*visibility:hidden/);
});
test('language and both theme preferences are applied before the main module runs',()=>{
  const english=startup({english:true,theme:'light'});
  assert.equal(english.root.dataset.language,'en');assert.equal(english.root.lang,'en');assert.equal(english.root.dataset.theme,'light');
  const chinese=startup({theme:'dark'});
  assert.equal(chinese.root.dataset.language,'zh');assert.equal(chinese.root.lang,'zh-CN');assert.equal(chinese.root.dataset.theme,'dark');
  assert.equal(startup({theme:'invalid'}).root.dataset.theme,'dark');
});
test('repeat visits, reduced motion, and direct content links always retain visible content',()=>{
  for(const options of [{seen:true},{reduced:true},{hash:'#home'},{hash:'#entry/article-example'},{hash:'#races'}]) {
    const state=startup(options);assert.equal(state.classes.has('intro-pending'),false);assert.equal(state.classes.has('intro-complete'),true);assert.equal(state.timers.size,0);
  }
});
test('storage denial keeps the homepage visible with its default language and theme',()=>{
  const state=startup({storageFails:true});assert.equal(state.classes.has('intro-pending'),false);assert.equal(state.classes.has('intro-complete'),true);
  assert.equal(state.root.dataset.language,'zh');assert.equal(state.root.lang,'zh-CN');assert.equal(state.root.dataset.theme,'dark');
  assert.equal(state.listeners.size,0);assert.equal(state.timers.size,0);
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
