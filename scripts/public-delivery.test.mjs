import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runInNewContext} from 'node:vm';
import {handle} from '../server/api.js';
import {LocalStore} from '../server/local-store.js';
import {sessionCookie} from '../server/auth.js';
import {buildPublicationPolicy,runtimePublicationAllowed} from '../server/publication-policy.js';

const request=(path,options={})=>new Request('https://fixture.test'+path,options);
const policy={source:'local',mode:'static',lifecycle:null};
const env={WAYPOINT_PUBLIC_SOURCE:'local',WAYPOINT_CONTENT_DELIVERY:'static',WAYPOINT_PUBLICATION_BUILD:policy,WAYPOINT_SESSION_SECRET:'fictional-local-session-secret'};
const entry={id:'fictional-race',kind:'race',published:true,titleZh:'虚构比赛',titleEn:'Fictional race',date:'2026-01-02',bodyZh:'',bodyEn:'',photos:['fictional-photo'],certificates:['fictional-pdf'],category:'Trail'};
function noStorage() {
  const calls=[];
  const store=new Proxy({mode:'local'},{get:(target,name)=>name in target?target[name]:async()=>{calls.push(name);throw new Error('unexpected_storage_read');}});
  return {store,calls};
}
function pdfStore({mime='application/pdf',withdraw=false,published=true}={}) {
  const counts={auth:0,entries:0,entry:0,media:0,file:0,cancel:0};
  let current={...entry,published};
  const store={mode:'local',
    auth:async()=>{counts.auth++;return null;},
    entries:async()=>{counts.entries++;return [current];},
    entry:async id=>{counts.entry++;assert.equal(id,entry.id);return current;},
    media:async()=>{counts.media++;return {id:'fictional-pdf',mime,size:12};},
    file:async()=>{counts.file++;if(withdraw)current={...current,published:false};return {size:12,body:new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('%PDF-1.7\nOK'));},cancel(){counts.cancel++;}})};}
  };
  return {store,counts};
}

test('static catalog routes and anonymous image rejection perform no storage operations',async()=>{
  const {store,calls}=noStorage();
  for(const [query,file]of [['','catalog'],['?kind=race','races'],['?kind=article','articles']]) {
    const result=await handle(request('/api/entries'+query),store,env);
    assert.equal(result.status,307);assert.equal(result.headers.get('location'),'/published/'+file+'.json');assert.match(result.headers.get('cache-control'),/no-store/);
  }
  for(const query of ['?kind=private','?kind=race&kind=article','?kind='])assert.equal((await handle(request('/api/entries'+query),store,env)).status,400);
  for(const path of ['/media/fictional-photo','/media/fictional-photo?entry=fictional-race','/media/fictional-photo?entry=fictional-race&size=read']) {
    const result=await handle(request(path),store,env);assert.equal(result.status,404);assert.match(result.headers.get('cache-control'),/no-store/);
  }
  assert.deepEqual(calls,[]);
});

test('PDF requests need a unique valid entry and exact format without image presets',async()=>{
  const {store,calls}=noStorage();
  for(const query of ['?format=pdf','?format=pdf&entry=','?format=pdf&entry=../private','?format=pdf&entry=fictional-race&entry=fictional-race','?format=pdf&format=pdf&entry=fictional-race','?format=image&entry=fictional-race','?format=pdf&entry=fictional-race&size=read','?format=pdf&entry=fictional-race&size=']) {
    assert.equal((await handle(request('/media/fictional-pdf'+query),store,env)).status,404);
  }
  assert.deepEqual(calls,[]);
});

test('PDF originals check MIME before bytes, keep reads scoped, and recheck publication',async()=>{
  for(const method of ['GET','HEAD']) {
    const {store,counts}=pdfStore();
    const result=await handle(request('/media/fictional-pdf?entry=fictional-race&format=pdf',{method}),store,env);
    assert.equal(result.status,200);assert.equal(result.headers.get('content-type'),'application/pdf');assert.match(result.headers.get('cache-control'),/no-store/);
    if(method==='GET')await result.body.cancel();
    assert.deepEqual({...counts,cancel:0},{auth:0,entries:0,entry:2,media:1,file:method==='GET'?1:0,cancel:0});
  }
  const spoof=pdfStore({mime:'image/webp'});
  assert.equal((await handle(request('/media/fictional-pdf?entry=fictional-race&format=pdf'),spoof.store,env)).status,404);
  assert.deepEqual(spoof.counts,{auth:0,entries:0,entry:1,media:1,file:0,cancel:0});
  const racing=pdfStore({withdraw:true});
  assert.equal((await handle(request('/media/fictional-pdf?entry=fictional-race&format=pdf'),racing.store,env)).status,404);
  assert.deepEqual(racing.counts,{auth:0,entries:0,entry:2,media:1,file:1,cancel:1});
  const draft=pdfStore({published:false});
  assert.equal((await handle(request('/media/fictional-pdf?entry=fictional-race&format=pdf'),draft.store,env)).status,404);
  assert.deepEqual(draft.counts,{auth:0,entries:0,entry:1,media:0,file:0,cancel:0});
});

test('owner sessions keep live management and private image previews in static delivery',async()=>{
  const cookie=sessionCookie(request('/api/session'),env).split(';')[0];
  const {store,counts}=pdfStore({mime:'image/png',published:false});
  const result=await handle(request('/media/fictional-photo',{headers:{cookie}}),store,env);
  assert.equal(result.status,200);await result.body.cancel();
  assert.deepEqual({...counts,cancel:0},{auth:1,entries:0,entry:0,media:1,file:1,cancel:0});
  const session=await (await handle(request('/api/session',{headers:{cookie}}),store,env)).json();
  assert.equal(session.owner,true);assert.equal(session.publication,'static');
  assert.equal((await(await handle(request('/api/manage/entries',{headers:{cookie}}),store,env)).json()).entries[0].published,false);
});

test('source, mode, lifecycle and Preview mismatches fail closed before every store operation',async()=>{
  assert.deepEqual(buildPublicationPolicy({}),{source:'live',mode:'live',lifecycle:null});
  assert.deepEqual(buildPublicationPolicy({WAYPOINT_PUBLIC_SOURCE:'local'}),policy);
  assert.throws(()=>buildPublicationPolicy({WAYPOINT_PUBLIC_SOURCE:'local',VERCEL_ENV:'production'}),/fixture_production_forbidden/);
  assert.throws(()=>buildPublicationPolicy({WAYPOINT_PUBLIC_SOURCE:'blob'}),/deployment_lifecycle_required/);
  assert.throws(()=>buildPublicationPolicy({WAYPOINT_PUBLIC_SOURCE:'blob',WAYPOINT_PUBLIC_LIFECYCLE:'deployment'}),/production_public_export_required/);
  assert.throws(()=>buildPublicationPolicy({WAYPOINT_PUBLIC_SOURCE:'blob',WAYPOINT_PUBLIC_LIFECYCLE:'deployment',VERCEL_ENV:'preview'}),/production_public_export_required/);
  assert.equal(runtimePublicationAllowed(policy,{...env,VERCEL_ENV:'preview'}),true);
  const blob={source:'blob',mode:'static',lifecycle:'deployment'};
  const blobEnv={WAYPOINT_PUBLIC_SOURCE:'blob',WAYPOINT_PUBLIC_LIFECYCLE:'deployment',WAYPOINT_CONTENT_DELIVERY:'static',WAYPOINT_PUBLICATION_BUILD:blob,VERCEL_ENV:'production'};
  assert.equal(runtimePublicationAllowed(blob,blobEnv),true);
  const live={source:'live',mode:'live',lifecycle:null};
  const variants=[{...env,WAYPOINT_PUBLIC_SOURCE:'live'},{...env,WAYPOINT_CONTENT_DELIVERY:'live'},{...env,WAYPOINT_PUBLIC_LIFECYCLE:'deployment'},{...env,VERCEL_ENV:'production'},{...env,WAYPOINT_PUBLICATION_BUILD:{...policy,mode:'live'}},{...blobEnv,VERCEL_ENV:'preview'},{...blobEnv,VERCEL_ENV:undefined},{WAYPOINT_PUBLICATION_BUILD:live,VERCEL_ENV:'preview'}];
  for(const settings of variants)for(const path of ['/api/entries','/api/session','/api/login','/api/manage/entries','/media/fictional-pdf?entry=fictional-race&format=pdf']) {
    const {store,calls}=noStorage();const result=await handle(request(path,{headers:{cookie:'waypoint_owner=forged'}}),store,settings);
    assert.equal(result.status,503);assert.deepEqual(calls,[]);
  }
  for(const path of ['/api/entries','/api/session','/api/login','/media/fictional-pdf?entry=fictional-race&format=pdf']) {
    const {store,calls}=noStorage();store.mode='blob';
    assert.equal((await handle(request(path),store,{...env,VERCEL_ENV:'preview'})).status,503);assert.deepEqual(calls,[]);
  }
});

test('fictional LocalStore PDFs publish and withdraw immediately while catalogs remain deployment assets',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'waypoint-static-api-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const store=new LocalStore(directory);
  await store.saveFile('fictional-pdf',new TextEncoder().encode('%PDF-1.7\nFictional'));
  await store.saveMedia({id:'fictional-pdf',mime:'application/pdf',size:18});
  await store.saveEntry({...entry,published:false,photos:[]});
  const path='/media/fictional-pdf?entry=fictional-race&format=pdf';
  assert.equal((await handle(request(path),store,env)).status,404);
  await store.saveEntry({...entry,photos:[]});const visible=await handle(request(path),store,env);assert.equal(visible.status,200);assert.match(await visible.text(),/Fictional/);
  await store.saveEntry({...entry,published:false,photos:[]});assert.equal((await handle(request(path),store,env)).status,404);
  assert.equal((await handle(request('/api/entries'),store,env)).headers.get('location'),'/published/catalog.json');
});

const mediaSource=await readFile(new URL('../dist/media-images.js',import.meta.url),'utf8');
const loaderSource=await readFile(new URL('../dist/public-content.js',import.meta.url),'utf8');
function frontend(mode='static') {
  const calls=[];
  const context={URL,document:{baseURI:'https://fixture.test/races'},location:{origin:'https://fixture.test'},publicationMode:mode,requestJSON:async url=>{calls.push(url);return context.payload;}};
  const strip=source=>source.replace(/^import .*;\n/gm,'').replace(/\bexport /g,'');
  const api=runInNewContext(strip(mediaSource)+'\n'+strip(loaderSource)+'\n({mediaURL,mediaImageURL,setPublishedMedia,requestPublishedEntries});',context);
  return {api,calls,context};
}
function catalog() {
  const image={type:'image'};for(const size of ['original','preview','read'])image[size]='/published/media/'+'a'.repeat(64)+'-'+size+'.webp';
  return {schema:1,entries:[entry],media:{'fictional-photo':image,'fictional-pdf':{type:'pdf'}}};
}
test('static media URLs accept only associated deployment files and keep PDFs out of image loading',()=>{
  const {api}=frontend();api.setPublishedMedia(catalog());
  assert.equal(api.mediaImageURL('/media/fictional-photo','preview',entry.id),'https://fixture.test/published/media/'+'a'.repeat(64)+'-preview.webp');
  assert.equal(api.mediaURL('/media/fictional-photo',entry.id),'https://fixture.test/published/media/'+'a'.repeat(64)+'-original.webp');
  assert.equal(api.mediaURL('/media/fictional-pdf',entry.id),'https://fixture.test/media/fictional-pdf?entry=fictional-race&format=pdf');
  for(const [source,size,id]of [['/media/fictional-pdf','read',entry.id],['/media/fictional-photo','read','other-entry'],['/media/fictional-photo','read',undefined],['https://evil.test/media/fictional-photo','read',entry.id],['/published/media/'+'a'.repeat(64)+'-read.webp','read',entry.id]])assert.throws(()=>api.mediaImageURL(source,size,id),/invalid_image_source/);
  for(const replacement of ['https://evil.test/media.webp','/published/media/'+ 'a'.repeat(64)+'-preview.webp?auth=private','/settings/auth.json','/published/media/short-preview.webp']) {
    const data=catalog();data.media['fictional-photo'].preview=replacement;assert.throws(()=>api.setPublishedMedia(data),/invalid_public_media/);
  }
  for(const published of [false,'true',1]) {
    const draft=catalog();draft.entries[0]={...entry,published};assert.throws(()=>api.setPublishedMedia(draft),/invalid_public_media/);
  }
  const extra=catalog();extra.media.unattached={type:'pdf'};assert.throws(()=>api.setPublishedMedia(extra),/invalid_public_media/);
});

test('withdrawing one entry blocks its PDF link while another published association remains readable',async()=>{
  const {store,counts}=pdfStore(),shared={...entry,id:'shared-pdf-publisher'};
  store.entry=async id=>{counts.entry++;return id===entry.id?{...entry,published:false}:id===shared.id?shared:null;};
  assert.equal((await handle(request('/media/fictional-pdf?entry='+entry.id+'&format=pdf'),store,env)).status,404);
  const response=await handle(request('/media/fictional-pdf?entry='+shared.id+'&format=pdf'),store,env);
  assert.equal(response.status,200);await response.body.cancel();
  assert.equal(counts.entries,0);assert.equal(counts.file,1);
});

test('static loaders request catalog subsets once and never fall back to live storage on errors',async()=>{
  const fixture=frontend();fixture.context.payload=catalog();
  await fixture.api.requestPublishedEntries();await fixture.api.requestPublishedEntries('race');
  assert.deepEqual(fixture.calls,['/published/catalog.json','/published/races.json']);
  fixture.context.payload={schema:1,entries:[{...entry,published:false}],media:{}};
  await assert.rejects(fixture.api.requestPublishedEntries(),/unavailable/);
  assert.equal(fixture.calls.some(path=>path.startsWith('/api/')),false);
  const live=frontend('live');live.context.payload={entries:[entry]};await live.api.requestPublishedEntries('race');assert.deepEqual(live.calls,['/api/entries?kind=race']);
});
