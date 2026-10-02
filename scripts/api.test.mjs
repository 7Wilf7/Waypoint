import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {handle} from '../server/api.js';
import {LocalStore} from '../server/local-store.js';
import {hashPassword,isOwner} from '../server/auth.js';
import {BlobPreconditionFailedError} from '@vercel/blob';

let directory,store,cookie;
const env={WAYPOINT_PASSWORD_HASH:hashPassword('test-owner-password'),WAYPOINT_SESSION_SECRET:'test-session-secret-'.repeat(3)};
const headers={origin:'https://waypoint.test','content-type':'application/json'};
const request=(path,options={})=>new Request('https://waypoint.test'+path,options);
const call=(path,options={})=>handle(request(path,options),store,env);
const write=(entry,extra={})=>call('/api/manage/entries/'+entry.id,{method:'PUT',headers:{...headers,cookie,...extra},body:JSON.stringify(entry)});
const race={id:'test-race',kind:'race',titleZh:'测试比赛',titleEn:'Test race',date:'2026-10-01',bodyZh:'测试内容',bodyEn:'Test content',published:false,photos:[],certificates:[],distance:30,ascent:1500,result:'08:32:10'};
before(async()=>{
  directory=await mkdtemp(join(tmpdir(),'waypoint-test-'));store=new LocalStore(directory);
  const login=await call('/api/login',{method:'POST',headers,body:JSON.stringify({password:'test-owner-password'})});
  assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];
  assert.match(login.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);assert.match(login.headers.get('set-cookie'),/Secure/);
});
after(()=>rm(directory,{recursive:true,force:true}));
test('password login, signed session, forged headers, tampering and logout',async()=>{
  assert.equal((await call('/api/login',{method:'POST',headers,body:JSON.stringify({password:'wrong'})})).status,401);
  assert.equal((await call('/api/login',{method:'POST',headers:{...headers,origin:'https://evil.test'},body:JSON.stringify({password:'test-owner-password'})})).status,403);
  assert.equal((await(await call('/api/session')).json()).owner,false);
  assert.equal((await(await call('/api/session',{headers:{cookie}})).json()).owner,true);
  for(const identity of [{},{'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@example.test'},{cookie:cookie+'bad'}])assert.equal((await call('/api/manage/entries',{headers:identity})).status,403);
  assert.equal(isOwner(request('/api/session',{headers:{cookie:cookie.replace(/=\d+/, '=1')}}),env),false);
  assert.equal(isOwner(request('/api/session',{headers:{cookie:cookie.replace(/\.[^.]+$/,'.'+'é'.repeat(43))}}),env),false);
  const logout=await call('/api/logout',{method:'POST',headers:{...headers,cookie}});assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
});
test('authenticated writes reject cross-origin requests',async()=>{
  assert.equal((await write(race,{origin:'https://another.test'})).status,403);
  assert.equal((await write(race,{'sec-fetch-site':'cross-site'})).status,403);
});
test('article publication retains its original date through publish and withdrawal',async()=>{
  const article={id:'original-article',kind:'article',published:true,titleZh:'原文日期测试',titleEn:'Original date test',date:'2024-09-07',publishedTime:'15:00',bodyZh:'测试正文',bodyEn:'Test body',articleLayout:[{type:'heading',index:0}],photos:[],certificates:[],wechatUrl:'https://mp.weixin.qq.com/s/test-article'};
  assert.equal((await write(article)).status,200);
  assert.equal((await(await call('/api/entries')).json()).entries.find(entry=>entry.id===article.id).date,'2024-09-07');
  assert.equal((await write({...article,published:false})).status,200);
  const saved=(await store.entries()).find(entry=>entry.id===article.id);
  assert.equal(saved.date,'2024-09-07');assert.equal(saved.publishedTime,'15:00');assert.deepEqual(saved.articleLayout,article.articleLayout);
});
test('drafts persist across store instances, publish, then disappear when returned to draft',async()=>{
  assert.equal((await write(race)).status,200);assert.equal((await(await call('/api/entries')).json()).entries.length,0);
  assert.equal((await new LocalStore(directory).entries())[0].titleZh,race.titleZh);
  assert.equal((await write({...race,published:true})).status,200);assert.equal((await(await call('/api/entries')).json()).entries[0].titleEn,'Test race');
  assert.equal((await write(race)).status,200);assert.equal((await(await call('/api/entries')).json()).entries.length,0);
});
test('uploads reject unsafe content; published references control photo and PDF visibility immediately',async()=>{
  const upload=(id,body)=>call('/api/manage/media/'+id+'?name=test',{method:'PUT',headers:{...headers,cookie},body});
  assert.equal((await upload('test-photo','<html>unsafe</html>')).status,400);
  assert.equal((await upload('test-photo',new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]))).status,200);
  assert.equal((await upload('test-certificate','%PDF-1.7\nTest certificate')).status,200);
  assert.equal((await call('/media/test-photo')).status,404);
  assert.equal((await call('/media/test-photo',{headers:{cookie}})).status,200);
  const entry={...race,published:true,photos:['test-photo'],certificates:['test-certificate']};
  assert.equal((await write(entry)).status,200);
  const visible=await call('/media/test-photo');assert.equal(visible.status,200);assert.equal(visible.headers.get('content-type'),'image/png');assert.match(visible.headers.get('cache-control'),/no-store/);
  assert.equal((await call('/media/test-certificate',{method:'HEAD'})).headers.get('content-type'),'application/pdf');
  assert.equal((await write({...entry,published:false})).status,200);assert.equal((await call('/media/test-photo')).status,404);
  const article={id:'inline-photo-article',kind:'article',published:false,titleZh:'正文图片',titleEn:'Inline photo',date:'2026-01-19',publishedTime:'22:00',bodyZh:'照片前\n\n照片后',bodyEn:'Before photo\n\nAfter photo',photos:['test-photo'],certificates:[],articleLayout:[{type:'paragraph',index:0},{type:'image',mediaId:'test-photo'},{type:'paragraph',index:1}]};
  assert.equal((await write(article)).status,200);assert.equal((await call('/media/test-photo')).status,404);
  assert.equal((await write({...article,published:true})).status,200);assert.equal((await call('/media/test-photo')).status,200);
  assert.deepEqual((await(await call('/api/entries')).json()).entries.find(item=>item.id===article.id).articleLayout,article.articleLayout);
  assert.equal((await write({...article,published:false})).status,200);assert.equal((await call('/media/test-photo')).status,404);
});
test('large direct uploads are finalized and streamed; oversize and anonymous tokens are rejected',async()=>{
  const bytes=Buffer.alloc(6*1024*1024);bytes.write('%PDF-1.7');await store.saveFile('large-certificate',bytes);
  const blobStore=Object.create(store);blobStore.mode='blob';
  const finalize=await handle(request('/api/manage/media/large-certificate',{method:'POST',headers:{...headers,cookie},body:JSON.stringify({filename:'large.pdf'})}),blobStore,env);
  assert.equal(finalize.status,200);assert.equal((await store.media('large-certificate')).size,bytes.length);
  const response=await call('/media/large-certificate',{headers:{cookie}});assert.equal((await response.arrayBuffer()).byteLength,bytes.length);
  const token=await handle(request('/api/manage/upload',{method:'POST',headers,body:JSON.stringify({type:'blob.generate-client-token',payload:{pathname:'media/test-photo',clientPayload:'{}'}})}),blobStore,env);assert.equal(token.status,403);
  const oversized=Buffer.alloc(8*1024*1024+1);oversized.write('%PDF-1.7');
  assert.equal((await call('/api/manage/media/oversize',{method:'PUT',headers:{...headers,cookie},body:oversized})).status,413);
});
test('invalid dates, missing English, unsafe article links, unknown files and PDF-as-photo are rejected',async()=>{
  for(const changes of [{date:'2026-02-30'},{published:true,titleEn:''},{photos:['missing-photo']},{photos:['test-certificate']},{kind:'article',published:true,wechatUrl:'javascript:alert(1)'},{kind:'article',published:true,wechatUrl:'https://mp.weixin.qq.com.evil.test/article'}])assert.equal((await write({...race,...changes})).status,400);
});
test('changing the owner password requires current credentials, persists and revokes old sessions',async()=>{
  const authDirectory=await mkdtemp(join(tmpdir(),'waypoint-password-test-'));const authStore=new LocalStore(authDirectory);
  const authCall=(path,options={})=>handle(request(path,options),authStore,env);
  const login=password=>authCall('/api/login',{method:'POST',headers,body:JSON.stringify({password})});
  try {
    const initial=await login('test-owner-password');const oldCookie=initial.headers.get('set-cookie').split(';')[0];
    const input={currentPassword:'test-owner-password',newPassword:'new-test-owner-password',confirmPassword:'new-test-owner-password'};
    const change=(data=input,extra={},session=oldCookie)=>authCall('/api/manage/password',{method:'POST',headers:{...headers,cookie:session,...extra},body:JSON.stringify(data)});
    assert.equal((await change(input,{},'')).status,403);assert.equal((await change(input,{origin:'https://evil.test'})).status,403);
    for(const changes of [{currentPassword:'wrong'},{newPassword:'short',confirmPassword:'short'},{confirmPassword:'does-not-match'},{newPassword:'test-owner-password',confirmPassword:'test-owner-password'}])assert.equal((await change({...input,...changes})).status,400);
    assert.equal(await authStore.auth(),null);
    const conflictStore=Object.create(authStore);conflictStore.saveAuth=async()=>{throw new BlobPreconditionFailedError();};
    const conflict=await handle(request('/api/manage/password',{method:'POST',headers:{...headers,cookie:oldCookie},body:JSON.stringify(input)}),conflictStore,env);assert.equal(conflict.status,409);assert.equal((await conflict.json()).error,'auth_changed');
    const changed=await change();assert.equal(changed.status,200);const newCookie=changed.headers.get('set-cookie').split(';')[0];
    assert.equal((await login('test-owner-password')).status,401);
    assert.equal((await authCall('/api/manage/entries',{headers:{cookie:oldCookie}})).status,403);
    assert.equal((await(await authCall('/api/session',{headers:{cookie:oldCookie}})).json()).owner,false);
    assert.equal((await(await authCall('/api/session',{headers:{cookie:newCookie}})).json()).owner,true);
    assert.equal((await login(input.newPassword)).status,200);
    assert.equal((await handle(request('/api/login',{method:'POST',headers,body:JSON.stringify({password:input.newPassword})}),new LocalStore(authDirectory),env)).status,200);
    const saved=await authStore.read('auth.json');assert.equal(saved.toString().includes(input.newPassword),false);
    const second={currentPassword:input.newPassword,newPassword:'second-test-owner-password',confirmPassword:'second-test-owner-password'};
    assert.equal((await change(second,{},newCookie)).status,200);
    assert.equal((await authCall('/api/manage/entries',{headers:{cookie:newCookie}})).status,403);
    assert.equal((await login(second.newPassword)).status,200);
    await assert.rejects(authStore.saveAuth({version:'stale'},null),/auth_changed/);
  }finally{await rm(authDirectory,{recursive:true,force:true});}
});
