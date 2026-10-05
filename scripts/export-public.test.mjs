import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import {exportPublished,publicationStore} from './export-public.mjs';
import {createPublicationFixture} from './public-fixture.mjs';
import {buildPublicationPolicy} from '../server/publication-policy.js';

async function fixture(work) {
  const root=await mkdtemp(join(tmpdir(),'waypoint-public-test-'));
  try{const data=await createPublicationFixture(join(root,'private'));return await work(root,data);}
  finally{await rm(root,{recursive:true,force:true});}
}
const catalog=async path=>JSON.parse(await readFile(join(path,'catalog.json'),'utf8'));

test('only explicit published fields and associated raster resources are exported; PDF bytes stay private',()=>fixture(async(root,{store})=>{
  const read=store.read.bind(store),reads=[];
  store.read=path=>{reads.push(path);return read(path);};
  store.auth=()=>{throw new Error('must_not_read_auth');};
  for(const method of ['write','saveEntry','saveMedia','saveFile','saveVariant','saveImageInfo','saveAuth'])store[method]=()=>{throw new Error('must_not_write_private_store');};
  const output=join(root,'published'),summary=await exportPublished(store,output),data=await catalog(output);
  assert.equal(summary.entries,3);assert.equal(summary.images,3);assert.equal(summary.livePDFs,1);
  assert.equal(data.schema,1);assert.ok(data.entries.every(entry=>entry.published===true));
  const serialized=JSON.stringify(data);
  for(const secret of ['PRIVATE-FIELD-SENTINEL','DRAFT-ONLY-SENTINEL','FAKE-AUTH-ONLY-SENTINEL','PRIVATE-FILENAME-SENTINEL','fixture-orphan-photo','fixture-draft-photo'])assert.ok(!serialized.includes(secret),secret);
  assert.ok(!reads.some(path=>/auth|draft-photo|orphan-photo|media-fixture-legacy-pdf/.test(path)));
  assert.deepEqual(data.media['fixture-legacy-pdf'],{type:'pdf'});
  assert.equal((await readdir(output)).sort().join(','),'articles.json,catalog.json,media,races.json');
  assert.equal(JSON.parse(await readFile(join(output,'races.json'),'utf8')).entries.length,2);
  assert.equal(JSON.parse(await readFile(join(output,'articles.json'),'utf8')).entries.length,1);
  for(const file of await readdir(join(output,'media'))) {
    assert.match(file,/^[a-f0-9]{64}-(preview|read|original)\.webp$/);
    const bytes=await readFile(join(output,'media',file)),meta=await sharp(bytes).metadata();
    assert.equal(meta.format,'webp');assert.ok(!meta.exif&&!meta.xmp&&!meta.icc&&!meta.iptc);
    assert.ok(!bytes.includes(Buffer.from('PRIVATE-EXIF-SENTINEL')));
  }
  const original=await sharp(await readFile(join(output,data.media['fixture-primary'].original.replace('/published/','')))).metadata();
  assert.deepEqual([original.width,original.height],[1200,1800]);
  assert.equal(data.entries.find(entry=>entry.kind==='article').bodyEn,'Fixture article heading\n\nThis is fictional writing, not Wilf Wu’s experience or race result.');
}));

test('draft publication and withdrawal take effect on the next snapshot; rollback rebuild preserves current withdrawals',()=>fixture(async(root,{store,entries})=>{
  const first=join(root,'first');await exportPublished(store,first);
  const withdrawn=entries.find(entry=>entry.id==='fixture-race-0');
  await store.saveEntry({...withdrawn,published:false});
  const draft=entries.find(entry=>entry.id==='fixture-draft-0');
  await store.saveEntry({...draft,published:true,photos:[],primaryPhoto:'',secondaryPhoto:''});
  assert.ok((await catalog(first)).entries.some(entry=>entry.id===withdrawn.id),'old deployment still contains its snapshot');
  const current=join(root,'current');await exportPublished(store,current);
  const data=await catalog(current);
  assert.ok(!data.entries.some(entry=>entry.id===withdrawn.id));assert.ok(data.entries.some(entry=>entry.id===draft.id));
  assert.ok(!data.media['fixture-primary']);assert.equal((await readdir(join(current,'media'))).length,0);
  const rollback=join(root,'rollback');await exportPublished(store,rollback);
  assert.deepEqual(await catalog(rollback),data,'rollback uses current authority, not the old snapshot');
}));

test('entry withdrawal during export fails and leaves no public output',()=>fixture(async(root,{store,entries})=>{
  const file=store.file.bind(store);let changed=false;
  store.file=async id=>{const result=await file(id);if(!changed){changed=true;await store.saveEntry({...entries[0],published:false});}return result;};
  await assert.rejects(exportPublished(store,join(root,'published')),/publication_changed/);
  assert.ok(!(await readdir(root)).some(name=>name==='published'||name.startsWith('.public-stage-')));
}));

test('association or metadata changes during export fail before installation',()=>fixture(async(root,{store,entries})=>{
  const entry=store.entry.bind(store);
  store.entry=async id=>id===entries[0].id?{...entries[0],photos:[],primaryPhoto:'',secondaryPhoto:''}:entry(id);
  await assert.rejects(exportPublished(store,join(root,'changed-entry')),/publication_changed/);
  store.entry=entry;
  const media=store.media.bind(store);let reads=0;
  store.media=async id=>{const value=await media(id);return id==='fixture-primary'&&++reads>1?{...value,size:value.size+1}:value;};
  await assert.rejects(exportPublished(store,join(root,'changed-meta')),/publication_changed/);
}));

test('invalid linked raster never falls back to publishing the raw file',()=>fixture(async(root,{store})=>{
  // Corrupt only this fictional LocalStore.
  const bytes=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
  await writeFile(join(store.directory,'media-fixture-primary'),bytes);
  await store.saveMedia({id:'fixture-primary',mime:'image/png',size:bytes.length});
  await assert.rejects(exportPublished(store,join(root,'published')));
  assert.ok(!(await readdir(root)).includes('published'));
}));

test('existing output is preserved and new selected images must have valid metadata',()=>fixture(async(root,{store})=>{
  const old=join(root,'old');await mkdir(old);await writeFile(join(old,'keep.txt'),'do not replace');
  await assert.rejects(exportPublished(store,old),/snapshot_output_exists/);
  assert.equal(await readFile(join(old,'keep.txt'),'utf8'),'do not replace');
  const media=store.media.bind(store);store.media=async id=>id==='fixture-primary'?null:media(id);
  await assert.rejects(exportPublished(store,join(root,'new')),/invalid_public_media/);
}));

test('Blob export requires explicit production lifecycle; local export requires an explicit fixture directory',async()=>{
  assert.throws(()=>buildPublicationPolicy({WAYPOINT_PUBLIC_SOURCE:'blob'}),/deployment_lifecycle_required/);
  assert.throws(()=>buildPublicationPolicy({WAYPOINT_PUBLIC_SOURCE:'blob',WAYPOINT_PUBLIC_LIFECYCLE:'deployment',VERCEL_ENV:'preview'}),/production_public_export_required/);
  await assert.rejects(publicationStore({source:'blob'},{WAYPOINT_PUBLIC_LIFECYCLE:'deployment'}),/production_snapshot_approval_required/);
  await assert.rejects(publicationStore({source:'local'},{}),/explicit_local_directory_required/);
});

test('shared public images survive one withdrawal and disappear after all public associations withdraw',()=>fixture(async(root,{store,entries})=>{
  const first=entries.find(entry=>entry.id==='fixture-race-0'),second=entries.find(entry=>entry.id==='fixture-race-1');
  await store.saveEntry({...second,photos:['fixture-primary'],primaryPhoto:'fixture-primary',secondaryPhoto:''});
  await store.saveEntry({...first,published:false});
  const shared=join(root,'shared');await exportPublished(store,shared);
  assert.ok((await catalog(shared)).media['fixture-primary']);
  await store.saveEntry({...second,published:false});
  const withdrawn=join(root,'withdrawn');await exportPublished(store,withdrawn);
  assert.equal((await catalog(withdrawn)).media['fixture-primary'],undefined);
  assert.equal((await readdir(join(withdrawn,'media'))).length,0);
}));

test('public identifiers must be strings and publication must be an explicit boolean',async()=>{
  const root=await mkdtemp(join(tmpdir(),'waypoint-strict-public-'));
  try {
    const entry={id:123,kind:'race',published:true,photos:[],certificates:[]};
    await assert.rejects(exportPublished({entries:async()=>[entry]},join(root,'numeric')),/invalid_public_entry/);
    await exportPublished({entries:async()=>[{...entry,published:'true'}]},join(root,'truthy'));
    assert.equal((await catalog(join(root,'truthy'))).entries.length,0);
  }finally{await rm(root,{recursive:true,force:true});}
});
