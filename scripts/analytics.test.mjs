import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fetchAnalytics} from '../server/analytics.js';
import {handle} from '../server/api.js';
import {sessionCookie,hashPassword} from '../server/auth.js';
import {visitSource,visitPage,visitAllowed} from '../dist/visit-policy.js';
import {build} from 'esbuild';
import {runInNewContext} from 'node:vm';

const now=Date.parse('2026-10-10T02:00:00Z');
const settings={WAYPOINT_ANALYTICS_TOKEN:'fake-test-token',WAYPOINT_ANALYTICS_PROJECT_ID:'prj_fixture',WAYPOINT_ANALYTICS_TEAM_ID:'team_fixture'};
const samples=[{timestamp:'2026-10-09T15:00:00Z',pageviews:2},{timestamp:'2026-10-09T16:00:00Z',pageviews:3},{timestamp:'2026-10-10T01:00:00Z',pageviews:4}];
function provider(calls=[],override=()=>null){return async(url,options)=>{
  url=new URL(url);calls.push({url,options});const custom=override(url);if(custom)return custom;
  const q=url.searchParams,by=q.get('by'),since=Date.parse(q.get('since')),until=Date.parse(q.get('until'));
  let data;
  if(url.pathname.endsWith('/count'))data={pageviews:42,visitors:18};
  else if(by==='hour')data=samples.filter(row=>Date.parse(row.timestamp)>=since&&Date.parse(row.timestamp)<=until);
  else if(by==='environment')data=[{environment:'production',pageviews:7,visitors:5}];
  else if(by==='requestPath')data=[{requestPath:'/visits/moments/home',pageviews:4},{requestPath:'/visits/wechat/reading',pageviews:5,visitorId:'NEVER-RETURN-THIS'}];
  else if(by==='deviceType')data=[{deviceType:'mobile',pageviews:8},{deviceType:'desktop',pageviews:1}];
  else if(by==='country')data=[{country:'CN',pageviews:8},{country:'US',pageviews:1}];
  else if(by==='browserName')data=[{browserName:'WeChat',pageviews:8},{browserName:'Safari',pageviews:1}];
  else throw new Error('unexpected_query');
  return Response.json({version:1,data});
};}
test('Shanghai midnight, bounded hour chunks, PV totals and response field allowlist',async()=>{
  const calls=[],result=await fetchAnalytics(settings,30,{fetchFn:provider(calls),now});
  assert.equal(result.daily.length,30);assert.deepEqual(result.daily.at(-2),{date:'2026-10-09',pageviews:2});assert.deepEqual(result.daily.at(-1),{date:'2026-10-10',pageviews:7});
  assert.deepEqual(result.summary,{todayViews:7,todayVisitors:5,periodViews:9,totalViews:42});
  assert.deepEqual(result.breakdowns.sources,[{key:'wechat',pageviews:5},{key:'moments',pageviews:4}]);
  assert.doesNotMatch(JSON.stringify(result),/fake-test-token|NEVER-RETURN-THIS|visitorId|prj_fixture|team_fixture/);
  const chunks=calls.filter(call=>call.url.searchParams.get('by')==='hour');assert.equal(chunks.length,8);
  for(let i=0;i<chunks.length;i++){
    const q=chunks[i].url.searchParams;assert.equal(q.get('limit'),'100');assert.ok(Date.parse(q.get('until'))-Date.parse(q.get('since'))<4*86400000);
    if(i)assert.equal(Date.parse(q.get('since')),Date.parse(chunks[i-1].url.searchParams.get('until'))+1);
  }
  const todayCall=calls.find(call=>call.url.searchParams.get('by')==='environment');assert.equal(todayCall.url.searchParams.get('since'),'2026-10-09T16:00:00.000Z');
  assert.ok(calls.every(call=>call.url.origin==='https://api.vercel.com'&&call.options.redirect==='error'&&call.options.signal));
});
test('zero traffic is valid; configuration, provider errors and malformed counts are failures',async()=>{
  const empty=async url=>Response.json({data:new URL(url).pathname.endsWith('/count')?{pageviews:0}:[]});
  assert.equal((await fetchAnalytics(settings,7,{fetchFn:empty,now})).summary.totalViews,0);
  await assert.rejects(fetchAnalytics({},7),/analytics_not_configured/);
  await assert.rejects(fetchAnalytics(settings,999),/invalid_range/);
  await assert.rejects(fetchAnalytics(settings,7,{now,fetchFn:async()=>Response.json({error:{code:'web_analytics_not_enabled'}},{status:400})}),/analytics_not_configured/);
  await assert.rejects(fetchAnalytics(settings,7,{now,fetchFn:async()=>Response.json({error:{message:'secret-error'}},{status:401})}),/analytics_unavailable/);
  await assert.rejects(fetchAnalytics(settings,7,{now,fetchFn:provider([],url=>url.searchParams.get('by')==='hour'?Response.json({data:[{timestamp:'Others',pageviews:123}]}):null)}),/analytics_unavailable/);
  await assert.rejects(fetchAnalytics(settings,7,{now,fetchFn:provider([],url=>url.pathname.endsWith('/count')?Response.json({data:{pageviews:-1}}):null)}),/analytics_unavailable/);
});
test('late ingestion between independent queries keeps the report available and PV consistent',async()=>{
  const fetchFn=provider([],url=>url.searchParams.get('by')==='environment'?Response.json({data:[{environment:'production',pageviews:8,visitors:5}]}):null);
  const report=await fetchAnalytics(settings,7,{fetchFn,now});
  assert.equal(report.summary.todayViews,7);assert.equal(report.summary.todayVisitors,5);assert.equal(report.daily.at(-1).pageviews,7);
});
test('owner authentication precedes analytics cache/config and client query parameters are bounded',async()=>{
  const env={WAYPOINT_SESSION_SECRET:'test-analytics-secret',WAYPOINT_PASSWORD_HASH:hashPassword('test-password')};
  const store={auth:async()=>null};const cookie=sessionCookie(new Request('https://waypoint.test'),env).split(';')[0];
  const call=(path,headers={})=>handle(new Request('https://waypoint.test'+path,{headers}),store,env);
  assert.equal((await call('/api/manage/analytics?days=7')).status,403);
  assert.equal((await call('/api/manage/analytics?days=7',{'oai-authenticated-user-id':'owner'})).status,403);
  for(const path of ['?days=7&days=30','?days=1','?days=7&projectId=evil',''])assert.equal((await call('/api/manage/analytics'+path,{cookie})).status,400);
  const disconnected=await call('/api/manage/analytics?days=7',{cookie});assert.equal(disconnected.status,503);assert.deepEqual(await disconnected.json(),{error:'analytics_not_configured'});assert.equal(disconnected.headers.get('cache-control'),'no-store');
});
test('source tags are allowlisted, private paths excluded and daily visitors are never identities',()=>{
  assert.equal(visitSource(new URL('https://site.test/?from=moments&email=private@example.test')),'moments');
  assert.equal(visitSource(new URL('https://site.test/?from=private-person'),'','MicroMessenger'),'wechat');
  assert.equal(visitSource(new URL('https://site.test/'),'https://outside.test/private?q=secret'),'other');
  assert.equal(visitPage(new URL('https://site.test/manage')),null);
  assert.equal(visitPage(new URL('https://site.test/#entry/private-id')),null);
  assert.equal(visitPage(new URL('https://site.test/#entry/public-id'),{reading:true}),'reading');
  for(const preferences of [{owner:true},{optOut:true},{dnt:'1'},{gpc:true}])assert.equal(visitAllowed(preferences),false);
});
test('a cached report never bypasses revoked owner authentication or reads from content storage',async()=>{
  const originalFetch=globalThis.fetch;let calls=0,record=null;
  globalThis.fetch=async url=>{calls++;return Response.json({data:new URL(url).pathname.endsWith('/count')?{pageviews:0}:[]});};
  try {
    const env={...settings,WAYPOINT_ANALYTICS_TOKEN:'cache-test-token',WAYPOINT_SESSION_SECRET:'cache-owner-secret'};
    const store={auth:async()=>record,entries:async()=>{throw new Error('analytics_must_not_scan_content');}};
    const cookie=sessionCookie(new Request('https://waypoint.test'),env).split(';')[0];
    const call=()=>handle(new Request('https://waypoint.test/api/manage/analytics?days=7',{headers:{cookie}}),store,env);
    assert.equal((await call()).status,200);const reads=calls;assert.ok(reads>0);
    assert.equal((await call()).status,200);assert.equal(calls,reads);
    record={hash:hashPassword('changed-password'),version:'a'.repeat(32)};
    assert.equal((await call()).status,403);assert.equal(calls,reads);
  }finally{globalThis.fetch=originalFetch;}
});

async function trackerHarness({owner=false,dnt,gpc=false,enabled=true,hidden=false,fail=false,refreshSession}={}) {
  const bundle=await build({entryPoints:[new URL('../dist/visits.js',import.meta.url).pathname],bundle:true,write:false,format:'iife',globalName:'trackerModule',plugins:[{name:'isolated-analytics',setup(build){
    build.onResolve({filter:/analytics-(?:config|client)\.js$/},args=>({path:args.path,namespace:'analytics-fixture'}));
    build.onLoad({filter:/analytics-config\.js$/,namespace:'analytics-fixture'},()=>({contents:'export const analyticsEnabled='+enabled+';',loader:'js'}));
    build.onLoad({filter:/analytics-client\.js$/,namespace:'analytics-fixture'},()=>({contents:'export function inject(options){capture.injected.push(options)};export function pageview(options){capture.views.push(options)}',loader:'js'}));
  }}]});
  const document=new EventTarget(),window=new EventTarget(),reader={open:false,dataset:{analytics:'pending'}},location=new URL('https://site.test/?from=moments&token=secret');
  document.visibilityState=hidden?'hidden':'visible';document.referrer='';document.querySelector=()=>reader;
  const saved=new Map(),capture={injected:[],views:[]};
  const context={capture,document,window,location,navigator:{userAgent:'Chrome',doNotTrack:dnt,globalPrivacyControl:gpc},URL,localStorage:{getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value),removeItem:key=>saved.delete(key)}};
  runInNewContext(bundle.outputFiles[0].text,context);
  const tracker=context.trackerModule.createVisitTracker({session:fail?Promise.reject(new Error('offline')):Promise.resolve({owner}),refreshSession});await new Promise(resolve=>setImmediate(resolve));
  return {capture,document,window,location,tracker,reader,saved};
}
test('tracker honors privacy/owner/hidden/failure states before loading the provider SDK',async()=>{
  for(const options of [{owner:true},{dnt:'1'},{gpc:true},{enabled:false},{hidden:true},{fail:true}])assert.equal((await trackerHarness(options)).capture.injected.length,0);
});
test('tracker avoids duplicate routes, counts distinct completed readings and strips sensitive URLs',async()=>{
  const h=await trackerHarness();assert.equal(h.capture.views.length,1);assert.equal(h.capture.views[0].path,'/visits/moments/home');
  const middleware=h.capture.injected[0].beforeSend;assert.equal(h.capture.injected[0].disableAutoTrack,true);
  assert.equal(middleware({type:'pageview',url:'https://site.test/visits/moments/home?token=secret#private'}).url,'https://site.test/visits/moments/home');
  assert.equal(middleware({type:'pageview',url:'https://site.test/manage'}),null);
  assert.equal(middleware({type:'event',url:'https://site.test/visits/moments/home'}),null);
  h.tracker.send();assert.equal(h.capture.views.length,1);
  h.location.hash='#entry/one';h.reader.open=true;h.tracker.send();assert.equal(h.capture.views.length,1);
  h.reader.dataset.analytics='ready';h.tracker.send();h.tracker.send();assert.equal(h.capture.views.length,2);
  h.location.hash='#entry/two';h.tracker.send();assert.equal(h.capture.views.length,3);
  h.tracker.setOptOut(true);h.location.hash='#about';h.tracker.send();assert.equal(h.capture.views.length,3);assert.equal(middleware({type:'pageview',url:'https://site.test/visits/moments/home'}),null);
  assert.equal(h.saved.get('waypoint-analytics-opt-out'),'1');
});
test('returning to an open public tab rechecks owner identity before any new report',async()=>{
  let resolveSession,calls=0;
  const h=await trackerHarness({refreshSession:()=>{calls++;return new Promise(resolve=>{resolveSession=resolve;});}});
  assert.equal(h.capture.views.length,1);
  h.document.visibilityState='hidden';h.document.dispatchEvent(new Event('visibilitychange'));
  h.location.hash='#about';h.document.visibilityState='visible';h.document.dispatchEvent(new Event('visibilitychange'));h.window.dispatchEvent(new Event('focus'));
  h.tracker.send();assert.equal(h.capture.views.length,1);
  await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);
  resolveSession({owner:true});await new Promise(resolve=>setImmediate(resolve));h.tracker.send();assert.equal(h.capture.views.length,1);
  h.window.dispatchEvent(new Event('focus'));await new Promise(resolve=>setImmediate(resolve));resolveSession({owner:false});await new Promise(resolve=>setImmediate(resolve));assert.equal(h.capture.views.length,2);
  h.window.dispatchEvent(new Event('focus'));await new Promise(resolve=>setImmediate(resolve));
  const old=resolveSession;
  h.document.visibilityState='hidden';h.document.dispatchEvent(new Event('visibilitychange'));
  h.document.visibilityState='visible';h.document.dispatchEvent(new Event('visibilitychange'));await new Promise(resolve=>setImmediate(resolve));
  const latest=resolveSession;h.location.hash='#trails';h.tracker.send();assert.equal(h.capture.views.length,2);
  old({owner:false});await new Promise(resolve=>setImmediate(resolve));h.tracker.send();assert.equal(h.capture.views.length,2);
  latest({owner:true});await new Promise(resolve=>setImmediate(resolve));assert.equal(h.capture.views.length,2);
});
test('failed identity refresh stays untracked until a later successful check',async()=>{
  let fails=true;
  const h=await trackerHarness({refreshSession:async()=>{if(fails)throw new Error('offline');return {owner:false};}});
  h.window.dispatchEvent(new Event('focus'));h.location.hash='#about';await new Promise(resolve=>setImmediate(resolve));h.tracker.send();assert.equal(h.capture.views.length,1);
  fails=false;h.window.dispatchEvent(new Event('focus'));await new Promise(resolve=>setImmediate(resolve));assert.equal(h.capture.views.length,2);
});
test('a route change excludes a new owner even without browser focus or visibility events',async()=>{
  let currentOwner=true,calls=0;
  const h=await trackerHarness({refreshSession:async()=>{calls++;return {owner:currentOwner};}});
  h.location.hash='#about';h.document.dispatchEvent(new Event('waypoint-route'));h.document.dispatchEvent(new Event('waypoint-route'));
  await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);assert.equal(h.capture.views.length,1);
  currentOwner=false;h.location.hash='#trails';h.document.dispatchEvent(new Event('waypoint-route'));
  await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,2);assert.equal(h.capture.views.length,2);
  h.document.dispatchEvent(new Event('waypoint-route'));await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,2);
});
