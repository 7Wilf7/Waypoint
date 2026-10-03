// Public reading images only. Owner-only management previews use a separate loader.
// Keep decoded, private responses in bounded page memory; never persist image bytes.
const cache=new Map(),queue=[];
const limits={requests:2,entries:20,bytes:12*1024*1024,pixels:24000000,age:5*60*1000};
let active=0;

export function mediaImageURL(source,size='read') {
  if(!['preview','read'].includes(size))throw new Error('invalid_image_size');
  const url=new URL(source,document.baseURI);
  if(url.origin!==location.origin||!/^\/media\/[a-z0-9-]{1,64}$/.test(url.pathname))throw new Error('invalid_image_source');
  url.search='';url.searchParams.set('size',size);url.hash='';
  return url.href;
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
function acquire(source,{size='read',priority=true}={}) {
  const key=mediaImageURL(source,size);trim();
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
