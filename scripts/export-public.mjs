import {mkdir,mkdtemp,writeFile,rename,rm,access} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {validateEntry,ID,MAX_FILE,fileType} from '../server/content.js';

const MAX_PIXELS=64*1024*1024;
const MAX_ENTRIES=256,MAX_MEDIA=256,MAX_OUTPUT=192*1024*1024;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const publicEntry=entry=>{
  if(entry?.published!==true)throw new Error('publication_changed');
  if(typeof entry.id!=='string'||!ID.test(entry.id)||!['photos','certificates'].every(field=>Array.isArray(entry[field])&&entry[field].every(id=>typeof id==='string'&&ID.test(id))))throw new Error('invalid_public_entry');
  return validateEntry(entry);
};

// Read only the selected immutable original, with a bound on the actual stream.
async function originalBytes(store,id,meta) {
  if(!ID.test(id)||meta.id!==id||!Number.isSafeInteger(meta.size)||meta.size<=0||meta.size>MAX_FILE)throw new Error('invalid_public_media');
  const file=await store.file(id);
  if(!file||file.size!==meta.size){await file?.body?.cancel();throw new Error('public_media_missing');}
  const reader=file.body.getReader(),chunks=[];let size=0;
  try {
    for(;;) {
      const {done,value}=await reader.read();if(done)break;
      size+=value.length;
      if(size>MAX_FILE)throw new Error('public_media_too_large');
      chunks.push(value);
    }
  }catch(error){await reader.cancel();throw error;}
  finally{reader.releaseLock();}
  const bytes=Buffer.concat(chunks,size);
  if(size!==meta.size||fileType(bytes)!==meta.mime)throw new Error('invalid_public_media');
  return bytes;
}

// No raw originals, filenames, EXIF, private derivative writes or embedded bytes.
async function encodePublicImage(bytes) {
  const pipeline=sharp(bytes,{limitInputPixels:MAX_PIXELS}).autoOrient();
  const info=await pipeline.metadata();
  if(!info.width||!info.height||info.width*info.height>MAX_PIXELS||(info.pages||1)>1)throw new Error('unsupported_public_image');
  const output={};
  for(const preset of ['preview','read','original']) {
    const resize=preset==='preview'?{width:640,height:960,fit:'inside',withoutEnlargement:true}:preset==='read'?{width:1920,withoutEnlargement:true}:null;
    const encoder=pipeline.clone();if(resize)encoder.resize(resize);
    const bytes=await encoder.webp({quality:preset==='preview'?86:preset==='read'?90:95}).toBuffer();
    if(!bytes.length||bytes.length>MAX_FILE)throw new Error('public_media_too_large');
    output[preset]=bytes;
  }
  return output;
}

/**
 * A deployment snapshot, never a new permission authority.
 * The caller must pause all writers through deployment activation.
 * On failure, no output directory is installed; an existing output is untouched.
 */
export async function exportPublished(store,outputDirectory) {
  const output=resolve(outputDirectory);
  try{await access(output);throw new Error('snapshot_output_exists');}catch(error){if(error.code!=='ENOENT')throw error;}
  await mkdir(dirname(output),{recursive:true});
  const stage=await mkdtemp(join(dirname(output),'.public-stage-'));
  let installed=false;
  try {
    const saved=await store.entries();
    if(!Array.isArray(saved))throw new Error('invalid_public_entries');
    const entries=saved.filter(entry=>entry?.published===true).map(publicEntry)
      .sort((a,b)=>b.date.localeCompare(a.date)||(b.publishedTime||'').localeCompare(a.publishedTime||'')||a.id.localeCompare(b.id));
    if(entries.length>MAX_ENTRIES||new Set(entries.map(entry=>entry.id)).size!==entries.length)throw new Error('invalid_public_entries');
    const ids=[...new Set(entries.flatMap(entry=>[...entry.photos,...entry.certificates]))];
    if(ids.length>MAX_MEDIA)throw new Error('too_many_public_media');
    const media={},metadata=new Map(),files=new Map();let bytes=0;
    await mkdir(join(stage,'media'));
    for(const id of ids) {
      const meta=await store.media(id);
      if(!meta||meta.id!==id||!Number.isSafeInteger(meta.size)||meta.size<=0||meta.size>MAX_FILE)throw new Error('invalid_public_media');
      metadata.set(id,{id:meta.id,mime:meta.mime,size:meta.size});
      if(meta.mime==='application/pdf') {
        if(entries.some(entry=>entry.photos.includes(id)))throw new Error('invalid_public_media');
        media[id]={type:'pdf'};continue; // PDF bytes never enter the deployment.
      }
      if(!['image/jpeg','image/png','image/webp'].includes(meta.mime))throw new Error('invalid_public_media');
      const variants=await encodePublicImage(await originalBytes(store,id,meta));
      media[id]={type:'image'};
      for(const [preset,encoded] of Object.entries(variants)) {
        const name=hash(encoded)+'-'+preset+'.webp';
        if(!files.has(name)) {
          bytes+=encoded.length;if(bytes>MAX_OUTPUT)throw new Error('public_snapshot_too_large: '+bytes+' > '+MAX_OUTPUT+' bytes');
          await writeFile(join(stage,'media',name),encoded);files.set(name,encoded.length);
        }
        media[id][preset]='/published/media/'+name;
      }
    }
    // Legacy per-entry storage has no atomic snapshot. Refuse changed selections.
    for(const entry of entries) {
      const current=await store.entry(entry.id);
      if(JSON.stringify(publicEntry(current))!==JSON.stringify(entry))throw new Error('publication_changed');
    }
    for(const [id,meta] of metadata) {
      const current=await store.media(id);
      if(!current||JSON.stringify({id:current.id,mime:current.mime,size:current.size})!==JSON.stringify(meta))throw new Error('publication_changed');
    }
    for(const [name,kind] of [['catalog',null],['races','race'],['articles','article']]) {
      const selected=entries.filter(entry=>!kind||entry.kind===kind);
      const selectedIds=new Set(selected.flatMap(entry=>[...entry.photos,...entry.certificates]));
      const data=Buffer.from(JSON.stringify({schema:1,entries:selected,media:Object.fromEntries(Object.entries(media).filter(([id])=>selectedIds.has(id)))}));
      bytes+=data.length;if(bytes>MAX_OUTPUT)throw new Error('public_snapshot_too_large: '+bytes+' > '+MAX_OUTPUT+' bytes');
      await writeFile(join(stage,name+'.json'),data);
    }
    await rename(stage,output);installed=true;
    return {entries:entries.length,races:entries.filter(entry=>entry.kind==='race').length,articles:entries.filter(entry=>entry.kind==='article').length,
      images:Object.values(media).filter(item=>item.type==='image').length,livePDFs:Object.values(media).filter(item=>item.type==='pdf').length,files:files.size,bytes};
  }finally{if(!installed)await rm(stage,{recursive:true,force:true});}
}

export async function publicationStore(policy,env=process.env) {
  if(policy.source==='local') {
    if(!env.WAYPOINT_LOCAL_DIRECTORY)throw new Error('explicit_local_directory_required');
    const {LocalStore}=await import('../server/local-store.js');
    return new LocalStore(env.WAYPOINT_LOCAL_DIRECTORY);
  }
  if(policy.source==='blob') {
    if(env.VERCEL_ENV!=='production'||env.WAYPOINT_PUBLIC_LIFECYCLE!=='deployment')throw new Error('production_snapshot_approval_required');
    const {BlobStore}=await import('../server/blob-store.js');
    return new BlobStore(); // Export never calls auth(), PUT or any management method.
  }
  throw new Error('static_source_required');
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const {buildPublicationPolicy}=await import('../server/publication-policy.js');
  const policy=buildPublicationPolicy(process.env);
  const output=process.argv[2];
  if(!output)throw new Error('snapshot_output_directory_required');
  const result=await exportPublished(await publicationStore(policy),output);
  console.log(JSON.stringify(result));
}
