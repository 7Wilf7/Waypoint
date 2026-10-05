// Public reading images only. Owner-only management previews use a separate loader.
// Keep decoded, private responses in bounded page memory; never persist image bytes.
import {publicationMode} from './publication-config.js';
const cache=new Map(),queue=[];
const limits={requests:2,entries:20,bytes:12*1024*1024,pixels:24000000,age:5*60*1000};
let active=0;
let publishedMedia=new Map(),publishedReferences=new Map();
let publishedKinds=new Map(),publishedMediaRevisions=new Map(),publishedSequence=0;
const publishedRevisions=new Map();
const publicAsset=/^\/published\/media\/[a-f0-9]{64}-(original|preview|read)\.webp$/;
const identifier=/^[a-z0-9-]{1,64}$/i;

export function setPublishedMedia(data,kind,revision=++publishedSequence) {
  if(kind!==undefined&&!['race','article'].includes(kind))throw new Error('invalid_public_media');
  if(!Number.isSafeInteger(revision)||revision<1)throw new Error('invalid_public_media');
  publishedSequence=Math.max(publishedSequence,revision);
  if(data?.schema!==1||!Array.isArray(data.entries)||!data.media||typeof data.media!=='object'||Array.isArray(data.media))throw new Error('invalid_public_media');
  const media=new Map(),references=new Map(),kinds=new Map();
  for(const entry of data.entries) {
    if(entry?.published!==true||!identifier.test(entry.id||'')||!['race','article'].includes(entry.kind)||(kind&&entry.kind!==kind)||!Array.isArray(entry.photos)||!Array.isArray(entry.certificates)||references.has(entry.id))throw new Error('invalid_public_media');
    const ids=[...entry.photos,...entry.certificates];
    if(ids.some(id=>typeof id!=='string'||!identifier.test(id)))throw new Error('invalid_public_media');
    references.set(entry.id,new Set(ids));
    kinds.set(entry.id,entry.kind);
  }
  for(const [id,item]of Object.entries(data.media)) {
    if(!identifier.test(id)||!item||!['image','pdf'].includes(item.type)||![...references.values()].some(ids=>ids.has(id)))throw new Error('invalid_public_media');
    if(item.type==='image')for(const preset of ['original','preview','read']) {
      if(typeof item[preset]!=='string'||!publicAsset.test(item[preset])||!item[preset].endsWith('-'+preset+'.webp'))throw new Error('invalid_public_media');
    }
    media.set(id,item.type==='pdf'?{type:'pdf'}:{type:'image',original:item.original,preview:item.preview,read:item.read});
  }
  for(const ids of references.values())for(const id of ids)if(!media.has(id))throw new Error('invalid_public_media');
  // A subset replaces only its own kind. Older responses cannot overwrite a
  // newer full catalog or resurrect references removed by that response.
  const updated=new Set((kind?[kind]:['race','article']).filter(scope=>revision>=(publishedRevisions.get(scope)||0)));
  for(const [id,scope]of kinds)if(updated.has(scope)&&publishedKinds.has(id)&&publishedKinds.get(id)!==scope&&!updated.has(publishedKinds.get(id)))throw new Error('invalid_public_media');
  for(const [id,scope]of publishedKinds)if(updated.has(scope)){publishedKinds.delete(id);publishedReferences.delete(id);}
  const acceptedMedia=new Set();
  for(const [id,ids]of references)if(updated.has(kinds.get(id))) {
    publishedKinds.set(id,kinds.get(id));publishedReferences.set(id,ids);
    for(const mediaId of ids)acceptedMedia.add(mediaId);
  }
  for(const id of acceptedMedia)if(revision>=(publishedMediaRevisions.get(id)||0)) {
    publishedMedia.set(id,media.get(id));publishedMediaRevisions.set(id,revision);
  }
  for(const scope of updated)publishedRevisions.set(scope,revision);
  const retained=new Set([...publishedReferences.values()].flatMap(ids=>[...ids]));
  for(const id of publishedMedia.keys())if(!retained.has(id)){publishedMedia.delete(id);publishedMediaRevisions.delete(id);}
}

function sourceURL(source,entry) {
  const url=new URL(source,document.baseURI);
  if(url.origin!==location.origin||!/^\/media\/[a-z0-9-]{1,64}$/.test(url.pathname))throw new Error('invalid_image_source');
  url.search='';url.hash='';
  if(entry!=null) {
    if(typeof entry!=='string'||!identifier.test(entry))throw new Error('invalid_entry');
    url.searchParams.set('entry',entry);
  }
  return url;
}
function staticMedia(url,entry,preset) {
  const id=url.pathname.slice('/media/'.length),item=publishedMedia.get(id);
  if(!item||!publishedReferences.get(entry)?.has(id))throw new Error('invalid_image_source');
  if(item.type==='pdf') {
    if(preset!=='original')throw new Error('invalid_image_source');
    url.searchParams.set('format','pdf');return url.href;
  }
  return new URL(item[preset],location.origin).href;
}

export function mediaURL(source,entry) {
  const url=sourceURL(source,entry);
  if(publicationMode==='static')return staticMedia(url,entry,'original');
  if(publicationMode!=='live')throw new Error('invalid_image_source');
  return url.href;
}
export function mediaImageURL(source,size='read',entry) {
  if(!['preview','read'].includes(size))throw new Error('invalid_image_size');
  const url=sourceURL(source,entry);
  if(publicationMode==='static')return staticMedia(url,entry,size);
  if(publicationMode!=='live')throw new Error('invalid_image_source');
  url.searchParams.set('size',size);return url.href;
}

async function decode(source) {
  const image=new Image();image.decoding='async';
  const ready=new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('image_failed'));});
  image.src=source;
  await ready;
  if(image.decode)await image.decode();
  if(!image.naturalWidth||!image.naturalHeight)throw new Error('image_failed');
  image.width=image.naturalWidth;image.height=image.naturalHeight;
  return image;
}

function discard(entry) {
  if(cache.get(entry.key)!==entry)return;
  cache.delete(entry.key);
  if(entry.value)URL.revokeObjectURL(entry.value.src);
}
function trim() {
  let bytes=0,pixels=0;
  for(const entry of cache.values())if(entry.value){bytes+=entry.value.bytes;pixels+=entry.value.width*entry.value.height;}
  for(const entry of [...cache.values()].sort((a,b)=>a.used-b.used)) {
    if(!entry.value||entry.users)continue;
    if(cache.size<=limits.entries&&bytes<=limits.bytes&&pixels<=limits.pixels&&Date.now()-entry.loaded<limits.age)continue;
    bytes-=entry.value.bytes;pixels-=entry.value.width*entry.value.height;discard(entry);
  }
}
function drain() {
  while(active<limits.requests&&queue.length) {
    const entry=queue.shift();active++;
    entry.started=true;entry.controller=new AbortController();
    const timeout=setTimeout(()=>entry.controller.abort(),20000);
    (async()=>{
      let objectURL;
      try {
        const response=await fetch(entry.key,{signal:entry.controller.signal,credentials:'same-origin',cache:'no-store'});
        if(!response.ok)throw new Error('image_failed');
        const blob=await response.blob();
        if(!blob.size||blob.size>8*1024*1024||!/^image\/(jpeg|png|webp)$/.test(blob.type))throw new Error('image_failed');
        objectURL=URL.createObjectURL(blob);
        const image=await decode(objectURL);
        const value={src:objectURL,width:image.naturalWidth,height:image.naturalHeight,bytes:blob.size};
        if(cache.get(entry.key)!==entry){URL.revokeObjectURL(objectURL);throw new Error('image_cancelled');}
        entry.value=value;entry.loaded=Date.now();entry.resolve(value);
      } catch(error) {
        if(objectURL)URL.revokeObjectURL(objectURL);
        discard(entry);entry.reject(error);
      } finally {
        clearTimeout(timeout);active--;trim();drain();
      }
    })();
  }
}
function acquire(source,{size='read',entry:entryId,priority=true}={}) {
  const key=mediaImageURL(source,size,entryId);trim();
  let entry=cache.get(key);
  if(!entry) {
    // Do not grow the pending queue when many galleries are opened in succession.
    if(cache.size>=limits.entries) {
      const oldest=[...cache.values()].filter(item=>item.value&&!item.users).sort((a,b)=>a.used-b.used)[0];
      if(oldest)discard(oldest);else throw new Error('image_queue_full');
    }
    entry={key,used:Date.now(),users:0,started:false};
    entry.promise=new Promise((resolve,reject)=>{entry.resolve=resolve;entry.reject=reject;});
    cache.set(key,entry);
    priority?queue.unshift(entry):queue.push(entry);
  }else if(priority&&!entry.started) {
    const index=queue.indexOf(entry);if(index>=0){queue.splice(index,1);queue.unshift(entry);}
  }
  entry.used=Date.now();entry.users++;drain();
  return entry;
}

export async function loadMediaImage(source,options) {
  const entry=acquire(source,options);
  try {
    const value=await entry.promise;
    // A fresh element can be attached to each surface without moving another image.
    return await decode(value.src);
  }finally{entry.users--;entry.used=Date.now();trim();}
}
export async function preloadMediaImage(source,options={}) {
  const entry=acquire(source,{...options,priority:false});
  try{await entry.promise;}finally{entry.users--;trim();}
}

export function clearMediaImageCache() {
  for(const entry of cache.values()) {
    if(entry.value)URL.revokeObjectURL(entry.value.src);
    else if(entry.started)entry.controller.abort();
    else entry.reject(new Error('image_cancelled'));
  }
  cache.clear();queue.length=0;
}
if(typeof window!=='undefined')window.addEventListener('pagehide',clearMediaImageCache);
