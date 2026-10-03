import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {crc32} from 'node:zlib';
import sharp from 'sharp';
import {handle} from '../server/api.js';
import {LocalStore} from '../server/local-store.js';
import {IMAGE_VERSION,ensureImageVariants} from '../server/image-variants.js';

async function isolated(work) {
  const directory=await mkdtemp(join(tmpdir(),'waypoint-image-'));
  try{return await work(new LocalStore(directory),directory);}finally{await rm(directory,{recursive:true,force:true});}
}
async function source(store,id,bytes,mime='image/jpeg') {
  await store.saveFile(id,bytes);
  const meta={id,mime,size:bytes.length,filename:id};await store.saveMedia(meta);return meta;
}
const publicEntry=id=>({id:'race-'+id,kind:'race',date:'2026-10-01',published:true,photos:[id],certificates:[]});
const media=(store,id,size,method='GET')=>handle(new Request('https://waypoint.test/media/'+id+(size?'?size='+size:''),{method}),store,{});

test('published legacy preview respects its own shape and avoids downloading the original',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'waypoint-image-'));
  const store=new LocalStore(directory),id='legacy-wide-photo';
  try {
    const original=await sharp({create:{width:3200,height:2130,channels:3,background:'#4c5e7d'}}).jpeg({quality:95}).toBuffer();
    await store.saveFile(id,original);
    await store.saveMedia({id,mime:'image/jpeg',size:original.length,filename:'wide.jpg'});
    await store.saveEntry({id:'published-image-race',kind:'race',date:'2026-10-01',published:true,photos:[id],certificates:[]});
    const response=await handle(new Request('https://waypoint.test/media/'+id+'?size=preview'),store,{});
    assert.equal(response.status,200);
    assert.equal(response.headers.get('content-type'),'image/webp');
    const bytes=Buffer.from(await response.arrayBuffer()),metadata=await sharp(bytes).metadata();
    assert.equal(metadata.width,640);assert.equal(metadata.height,426);
    assert.ok(bytes.length<original.length*.9);
    const raw=await handle(new Request('https://waypoint.test/media/'+id),store,{});
    assert.deepEqual(Buffer.from(await raw.arrayBuffer()),original);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('auto-oriented portrait and long reading photos preserve proportions and strip derived EXIF',()=>isolated(async store=>{
  const rotated=await sharp({create:{width:1200,height:800,channels:3,background:'#ad653a'}}).jpeg({quality:95}).withMetadata({orientation:6}).toBuffer();
  const meta=await source(store,'rotated-portrait',rotated),info=await ensureImageVariants(store,meta);
  assert.equal(info.width,800);assert.equal(info.height,1200);
  assert.equal(info.presets.preview.width,640);assert.equal(info.presets.preview.height,960);
  const portrait=await store.variant(meta.id,IMAGE_VERSION,'preview'),decoded=await sharp(Buffer.from(await new Response(portrait.body).arrayBuffer())).metadata();
  assert.equal(decoded.orientation,undefined);assert.equal(decoded.exif,undefined);
  const long=await sharp({create:{width:2000,height:6000,channels:3,background:'#aab3cb'}}).jpeg({quality:95}).toBuffer();
  const longInfo=await ensureImageVariants(store,await source(store,'long-photo',long));
  assert.equal(longInfo.presets.read.width,1920);assert.equal(longInfo.presets.read.height,5760);
  const small=await sharp({create:{width:400,height:600,channels:3,background:'#bce1d3'}}).jpeg({quality:95}).toBuffer();
  const smallInfo=await ensureImageVariants(store,await source(store,'small-photo',small));
  for(const preset of Object.values(smallInfo.presets)){assert.equal(preset.width,400);assert.equal(preset.height,600);}
}));

test('low savings, undecodable historic photos and PDF fallback are persistent and preserve exact raw bytes',()=>isolated(async(store,directory)=>{
  const tiny=await sharp({create:{width:16,height:24,channels:3,background:'#abcdef'}}).webp({lossless:true}).toBuffer();
  for(const [id,bytes,mime] of [['efficient',tiny,'image/webp'],['invalid',Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]),'image/png'],['pdf',Buffer.from('%PDF-1.7\ncertificate'),'application/pdf']]) {
    const meta=await source(store,id,bytes,mime);await store.saveEntry(publicEntry(id));
    const info=await ensureImageVariants(store,meta);
    assert.ok(Object.values(info.presets).every(preset=>preset.source==='original'));
    assert.deepEqual(await new LocalStore(directory).imageInfo(id,IMAGE_VERSION),info);
    let writes=0;const reopened=new LocalStore(directory);reopened.saveImageInfo=()=>{writes++;throw new Error('re-encoding fallback');};
    for(const preset of ['preview','read']) {
      const response=await media(reopened,id,preset);assert.equal(response.status,200);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);assert.match(response.headers.get('cache-control'),/private, no-store/);
    }
    assert.equal(writes,0);
  }
}));

test('draft, unattached and withdrawn originals and derivatives are denied on every GET and HEAD',()=>isolated(async store=>{
  const bytes=await sharp({create:{width:800,height:1200,channels:3,background:'#538379'}}).jpeg({quality:95}).toBuffer();
  const id='private-photo';await source(store,id,bytes);
  for(const method of ['GET','HEAD'])for(const preset of ['', 'preview','read'])assert.equal((await media(store,id,preset,method)).status,404);
  await store.saveEntry({...publicEntry(id),published:false});assert.equal((await media(store,id,'preview')).status,404);
  await store.saveEntry(publicEntry(id));assert.equal((await media(store,id,'preview')).status,200);
  await store.saveEntry({...publicEntry(id),published:false});
  for(const method of ['GET','HEAD'])for(const preset of ['', 'preview','read'])assert.equal((await media(store,id,preset,method)).status,404);
  await store.saveEntry(publicEntry(id));assert.equal((await media(store,id,'arbitrary')).status,400);
}));

test('publication withdrawn during generation is rechecked before serving the derivative',()=>isolated(async store=>{
  const bytes=await sharp({create:{width:1600,height:1200,channels:3,background:'#556789'}}).jpeg({quality:95}).toBuffer();
  const id='race-withdrawn-during-generation';await source(store,id,bytes);await store.saveEntry(publicEntry(id));
  const save=store.saveImageInfo.bind(store);
  store.saveImageInfo=async(...args)=>{const result=await save(...args);await store.saveEntry({...publicEntry(id),published:false});return result;};
  assert.equal((await media(store,id,'preview')).status,404);
  assert.ok(await store.imageInfo(id,IMAGE_VERSION));
}));

test('final authorization rechecks the matching entry without rereading the entire catalog',()=>isolated(async store=>{
  const bytes=await sharp({create:{width:800,height:1200,channels:3,background:'#4f6d89'}}).jpeg({quality:95}).toBuffer();
  const id='scoped-authorization';await source(store,id,bytes);await store.saveEntry(publicEntry(id));
  let scans=0;const entries=store.entries.bind(store);store.entries=()=>{scans++;return entries();};
  assert.equal((await media(store,id,'preview')).status,200);
  assert.equal(scans,1,'a published photo should not read all entry JSON twice');
}));

test('fresh shared publishers and newly published replacements both authorize the completed image',async()=>{
  for(const alreadyPublished of [true,false])await isolated(async store=>{
    const bytes=await sharp({create:{width:800,height:1200,channels:3,background:'#a48264'}}).jpeg({quality:95}).toBuffer();
    const id='shared-publisher-photo';await source(store,id,bytes);
    const first={...publicEntry(id),id:'first-publisher'},second={...publicEntry(id),id:'replacement-publisher',published:alreadyPublished};
    await store.saveEntry(first);await store.saveEntry(second);
    let scans=0;const entries=store.entries.bind(store);store.entries=()=>{scans++;return entries();};
    const save=store.saveImageInfo.bind(store);
    store.saveImageInfo=async(...args)=>{const result=await save(...args);await store.saveEntry({...first,published:false});await store.saveEntry({...second,published:true});return result;};
    assert.equal((await media(store,id,'preview')).status,200);
    assert.equal(scans,alreadyPublished?1:2);
    assert.equal((await store.entry(first.id)).published,false);assert.equal((await store.entry(second.id)).published,true);
  });
});

test('lazy generation deduplicates requests, stays at two source reads, persists and survives cross-instance races',()=>isolated(async(store,directory)=>{
  const bytes=await sharp({create:{width:1600,height:1200,channels:3,background:'#c1984d'}}).jpeg({quality:95}).toBuffer();
  const metas=[];for(let i=0;i<5;i++)metas.push(await source(store,'parallel-'+i,bytes));
  let active=0,maxActive=0,reads=0;const file=store.file.bind(store);
  store.file=async id=>{reads++;active++;maxActive=Math.max(maxActive,active);await new Promise(resolve=>setTimeout(resolve,15));try{return await file(id);}finally{active--;}};
  const results=await Promise.all([...metas.map(meta=>ensureImageVariants(store,meta)),ensureImageVariants(store,metas[0]),ensureImageVariants(store,metas[0])]);
  assert.equal(reads,5);assert.equal(maxActive,2);assert.deepEqual(results[0],results[5]);
  const reopened=new LocalStore(directory);reopened.file=()=>{throw new Error('original re-decoded');};
  assert.deepEqual(await ensureImageVariants(reopened,metas[0]),results[0]);
  const raced=await source(store,'cross-instance-race',bytes),a=new LocalStore(directory),b=new LocalStore(directory);
  const [first,second]=await Promise.all([ensureImageVariants(a,raced),ensureImageVariants(b,raced)]);
  assert.deepEqual(first,second);
  for(const preset of ['preview','read']) {
    const variant=await a.variant(raced.id,IMAGE_VERSION,preset);assert.equal(variant.size,first.presets[preset].size);await variant.body.cancel();
  }
}));

test('oversized pixel headers fall back without allocating a decoded image',()=>isolated(async store=>{
  const bytes=await sharp({create:{width:1,height:1,channels:3,background:'#ffffff'}}).png().toBuffer();
  bytes.writeUInt32BE(9000,16);bytes.writeUInt32BE(9000,20);bytes.writeUInt32BE(crc32(bytes.subarray(12,29)),29);
  const advertised=await sharp(bytes,{limitInputPixels:false}).metadata();assert.equal(advertised.width*advertised.height,81000000);
  const meta=await source(store,'excessive-pixels',bytes,'image/png'),info=await ensureImageVariants(store,meta);
  assert.ok(Object.values(info.presets).every(preset=>preset.source==='original'));
  assert.equal(await store.variant(meta.id,IMAGE_VERSION,'preview'),null);
}));

test('raw large image responses remain streams and HEAD never reads their body',async()=>{
  let pulls=0,fileReads=0;const bytes=Buffer.alloc(6*1024*1024);
  const store={entries:async()=>[{published:true,photos:['large'],certificates:[]}],media:async()=>({id:'large',size:bytes.length,mime:'image/jpeg'}),file:async()=>{fileReads++;return {size:bytes.length,body:new ReadableStream({pull(controller){pulls++;controller.enqueue(bytes);controller.close();}},{highWaterMark:0})};}};
  const response=await media(store,'large','');assert.equal(pulls,0);assert.equal(response.headers.get('content-length'),String(bytes.length));
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);assert.equal(pulls,1);
  assert.equal((await media(store,'large','','HEAD')).status,200);assert.equal(fileReads,1);
});
