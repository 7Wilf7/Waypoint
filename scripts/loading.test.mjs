import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {requestJSON} from '../dist/loading.js';
import {mediaURL,mediaImageURL} from '../dist/media-images.js';

const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
const bootstrap=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
const welcome=html.match(/<script data-waypoint-welcome>\s*([\s\S]*?)<\/script>/)[1];
function startup({seen=false,reduced=false,hash='',pathname='/',english=false,theme=null,storageFails=false}={}) {
  const classes=new Set(),listeners=new Map(),timers=new Map();let nextTimer=0;
  const root={dataset:{theme:'dark',language:'zh'},lang:'zh-CN',classList:{add:(...items)=>items.forEach(item=>classes.add(item)),remove:(...items)=>items.forEach(item=>classes.delete(item)),contains:item=>classes.has(item)}};
  const events=target=>({addEventListener:(type,fn)=>listeners.set(target+':'+type,fn),removeEventListener:(type,fn)=>{if(listeners.get(target+':'+type)===fn)listeners.delete(target+':'+type);}});
  const storage={getItem:key=>{if(storageFails)throw Error('Denied');return key==='waypoint-theme'?theme:key==='waypoint-welcome'&&seen?'seen':key==='waypoint-language'&&english?'en':null;},setItem:()=>{}};
  const document={documentElement:root,hidden:false,...events('document')},media={matches:reduced,...events('media')};
  runInNewContext(bootstrap+'\n'+welcome,{document,window:events('window'),localStorage:storage,sessionStorage:storage,matchMedia:()=>media,location:{hash,pathname},setTimeout:(fn,delay)=>{const id=++nextTimer;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id)});
  return {root,classes,listeners,timers,document,media,emit:(target,type,event={})=>listeners.get(target+':'+type)?.({type,...event})};
}

test('a fresh homepage shows its greeting before the main module runs',()=>{
  const first=startup();assert.equal(first.classes.has('intro-pending'),true);
  assert.equal(first.classes.has('intro-complete'),false);
  assert.match(html,/class="welcome-screen"/);
  assert.match(html,/data-welcome="zh" lang="zh-CN">你好</);
});
test('language and all four background preferences are applied before the main module runs',()=>{
  const english=startup({english:true,theme:'light'});
  assert.equal(english.root.dataset.language,'en');assert.equal(english.root.lang,'en');assert.equal(english.root.dataset.theme,'light');
  const chinese=startup({theme:'dark'});
  assert.equal(chinese.root.dataset.language,'zh');assert.equal(chinese.root.lang,'zh-CN');assert.equal(chinese.root.dataset.theme,'dark');
  for(const theme of ['dark','light','moss','gray'])assert.equal(startup({theme}).root.dataset.theme,theme);
  assert.equal(startup({theme:'invalid'}).root.dataset.theme,'dark');
});
test('direct content links bypass the homepage greeting',()=>{
  for(const options of [{hash:'#read/about'},{hash:'#races'},{pathname:'/races'},{pathname:'/manage'}]) {
    const state=startup(options);assert.equal(state.classes.has('intro-pending'),false);assert.equal(state.classes.has('intro-complete'),true);assert.equal(state.timers.size,0);
  }
});
test('reopening the homepage does not suppress the greeting through an old session marker',()=>{
  for(const options of [{seen:true},{hash:'#home'}])assert.equal(startup(options).classes.has('intro-pending'),true);
});
test('the twenty-language greeting releases the page in about six seconds without any main-module response',()=>{
  const state=startup();
  for(const [id,{fn,delay}] of [...state.timers].sort((a,b)=>a[1].delay-b[1].delay)) {
    assert.ok(delay<=6100);state.timers.delete(id);fn();
  }
  assert.equal(state.classes.has('intro-pending'),false);assert.equal(state.classes.has('intro-leaving'),false);assert.equal(state.classes.has('intro-complete'),true);
  assert.equal(state.listeners.size,0);assert.equal(state.timers.size,0);
});
test('keys, clicks, hidden pages, hash changes and reduced-motion changes cannot dismiss the greeting early',()=>{
  assert.doesNotMatch(html,/class="welcome-skip"/);
  for(const [target,type] of [['document','keydown'],['document','click'],['window','hashchange'],['document','visibilitychange'],['media','change']]) {
    const state=startup();state.document.hidden=true;state.media.matches=true;
    let prevented=false,stopped=false;
    state.emit(target,type,{preventDefault:()=>{prevented=true;},stopImmediatePropagation:()=>{stopped=true;}});
    assert.equal(state.classes.has('intro-pending'),true);assert.equal(state.classes.has('intro-complete'),false);
    assert.equal(state.timers.size,2);
    assert.equal(prevented,type==='keydown');assert.equal(stopped,type==='keydown');
  }
});
test('reduced motion retains the same bounded homepage wait',()=>{
  const state=startup({reduced:true});assert.equal(state.classes.has('intro-pending'),true);
  assert.equal(Math.max(...[...state.timers.values()].map(timer=>timer.delay)),6020);
});
test('browser shortcuts stay available and leaving the page cleans up the greeting',()=>{
  const state=startup();let prevented=false;
  state.emit('document','keydown',{metaKey:true,preventDefault:()=>{prevented=true;}});
  assert.equal(prevented,false);assert.equal(state.classes.has('intro-pending'),true);
  state.emit('window','pagehide');
  assert.equal(state.classes.has('intro-pending'),false);assert.equal(state.listeners.size,0);assert.equal(state.timers.size,0);
});
test('storage denial retains default preferences and a bounded greeting',()=>{
  const state=startup({storageFails:true});assert.equal(state.classes.has('intro-pending'),true);
  assert.equal(state.root.dataset.language,'zh');assert.equal(state.root.lang,'zh-CN');assert.equal(state.root.dataset.theme,'dark');
  assert.equal(Math.max(...[...state.timers.values()].map(timer=>timer.delay)),6020);
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


test('media URLs retain the entry hint for images and original links without accepting foreign or invalid paths',t=>{
  const document=globalThis.document,location=globalThis.location;
  t.after(()=>{if(document===undefined)delete globalThis.document;else globalThis.document=document;if(location===undefined)delete globalThis.location;else globalThis.location=location;});
  globalThis.document={baseURI:'https://waypoint.test/races'};globalThis.location={origin:'https://waypoint.test'};
  assert.equal(mediaImageURL('/media/photo?untrusted=1#fragment','preview','race-one'),'https://waypoint.test/media/photo?entry=race-one&size=preview');
  assert.equal(mediaImageURL('/media/photo','read','article-two'),'https://waypoint.test/media/photo?entry=article-two&size=read');
  assert.equal(mediaURL('/media/photo','race-one'),'https://waypoint.test/media/photo?entry=race-one');
  assert.equal(mediaImageURL('/media/photo'),'https://waypoint.test/media/photo?size=read');
  for(const entry of ['', '../draft', 'one&entry=two', 'a'.repeat(65), 4])assert.throws(()=>mediaImageURL('/media/photo','read',entry),/invalid_entry/);
  assert.throws(()=>mediaURL('https://other.test/media/photo','race-one'),/invalid_image_source/);
  assert.throws(()=>mediaURL('/settings/auth.json','race-one'),/invalid_image_source/);
});

test('journal loading notifications can reenter a direct-entry route without starting another request',async()=>{
  const source=await readFile(new URL('../dist/journal.js',import.meta.url),'utf8');
  const loader=source.slice(source.indexOf('export function initJournal('),source.indexOf('// Request the current deployment catalog')).replace('export ','');
  let resolve,calls=0,notifications=0,renders=0,reentered;
  const response=new Promise(done=>{resolve=done;});
  const context={request:null,requested:false,loading:false,failed:false,errorKey:'',entries:[],Event,
    requestPublishedEntries:()=>{calls++;return response;},renderJournal:()=>{renders++;},
    document:{dispatchEvent:event=>{
      if(event.type==='journal-loading') {
        if(++notifications>1)throw new Error('recursive_loading_notification');
        reentered=context.initJournal();
      }
    }}};
  runInNewContext(loader,context);
  const first=context.initJournal();
  assert.equal(reentered,first);assert.equal(context.initJournal(),first);assert.equal(calls,1);
  resolve({entries:[{id:'direct-entry'}]});await first;
  assert.equal(context.entries[0].id,'direct-entry');assert.equal(context.loading,false);
  assert.equal(context.request,null);assert.equal(notifications,1);assert.equal(renders,2);
});
