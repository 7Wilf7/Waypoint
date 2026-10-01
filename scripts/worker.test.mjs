import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';
import {handle} from '../worker/index.js';
const db=new DatabaseSync(':memory:');
for(const file of (await readdir(new URL('../drizzle/',import.meta.url))).filter(file=>file.endsWith('.sql')).sort())db.exec(await readFile(new URL('../drizzle/'+file,import.meta.url),'utf8'));
const files=new Map();
const env={WAYPOINT_OWNER_EMAIL:'owner@example.test',DB:{prepare(sql){const statement=db.prepare(sql);const wrap=(values=[])=>({bind(...next){return wrap(next);},async all(){return{results:statement.all(...values)};},async first(){return statement.get(...values)||null;},async run(){return statement.run(...values);}});return wrap();}},BUCKET:{async put(key,bytes){files.set(key,bytes);},async get(key){return files.has(key)?{body:files.get(key)}:null;}}};
const headers={'oai-authenticated-user-id':'site-owner','oai-authenticated-user-email':'owner@example.test',origin:'https://waypoint.test','content-type':'application/json'};
const request=(path,options={})=>new Request('https://waypoint.test'+path,options);
const race={id:'test-race',kind:'race',titleZh:'测试比赛',titleEn:'Test race',date:'2026-10-01',bodyZh:'测试内容',bodyEn:'Test content',published:false,photos:[],certificates:[],distance:30,ascent:1500,result:'08:32:10'};
test('management rejects anonymous, different identity, and cross-origin writes',async()=>{
  for(const identity of [{},{...headers,'oai-authenticated-user-email':'someone@example.test'},{...headers,origin:'https://another.test'}])assert.equal((await handle(request('/api/manage/entries/test-race',{method:'PUT',headers:identity,body:JSON.stringify(race)}),env)).status,403);
});
test('drafts stay private; publishing and returning to draft control discovery',async()=>{
  const write=published=>handle(request('/api/manage/entries/test-race',{method:'PUT',headers,body:JSON.stringify({...race,published})}),env);
  assert.equal((await write(false)).status,200);assert.equal((await(await handle(request('/api/entries'),env)).json()).entries.length,0);
  assert.equal((await write(true)).status,200);assert.equal((await(await handle(request('/api/entries'),env)).json()).entries[0].titleEn,'Test race');
  assert.equal((await write(false)).status,200);assert.equal((await(await handle(request('/api/entries'),env)).json()).entries.length,0);
});
test('uploads are type checked and draft files stay private until referenced publicly',async()=>{
  const upload=body=>handle(request('/api/manage/media/test-photo?name=test.png',{method:'PUT',headers,body}),env);
  assert.equal((await upload('<html>unsafe</html>')).status,400);
  assert.equal((await upload(new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]))).status,200);
  assert.equal((await handle(request('/media/test-photo'),env)).status,404);
  assert.equal((await handle(request('/media/test-photo',{headers}),env)).status,200);
  const response=await handle(request('/api/manage/entries/test-race',{method:'PUT',headers,body:JSON.stringify({...race,published:true,photos:['test-photo']})}),env);assert.equal(response.status,200);
  const visible=await handle(request('/media/test-photo'),env);assert.equal(visible.status,200);assert.equal(visible.headers.get('content-type'),'image/png');
});
test('invalid dates, missing English, unsafe source links and missing media are rejected',async()=>{
  for(const changes of [{date:'2026-02-30'},{published:true,titleEn:''},{photos:['missing-photo']},{kind:'article',published:true,wechatUrl:'javascript:alert(1)'},{kind:'article',published:true,wechatUrl:'https://mp.weixin.qq.com.evil.test/article'}])assert.equal((await handle(request('/api/manage/entries/test-race',{method:'PUT',headers,body:JSON.stringify({...race,...changes})}),env)).status,400);
});
