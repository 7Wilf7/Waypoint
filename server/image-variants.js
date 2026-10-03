import sharp from 'sharp';
import {MAX_FILE} from './content.js';

export const IMAGE_VERSION='v1';
export const IMAGE_PRESETS=['preview','read'];
const MAX_INPUT_PIXELS=64*1024*1024;
const flights=new WeakMap();
let active=0;
const waiting=[];

// Bound decoded image memory, including competing requests for different photos.
sharp.cache({memory:32,files:0,items:32});
sharp.concurrency(1);
async function limited(work) {
  if(active<2)active++;else await new Promise(resolve=>waiting.push(resolve));
  try{return await work();}finally{const next=waiting.shift();if(next)next();else active--;}
}
const originalPreset=meta=>({source:'original',mime:meta.mime,size:meta.size});
const fallback=meta=>({version:IMAGE_VERSION,presets:Object.fromEntries(IMAGE_PRESETS.map(name=>[name,originalPreset(meta)]))});

// Separate immutable generation records prevent lazy reads from overwriting main metadata.
export async function ensureImageVariants(store,meta,uploadedBytes) {
  const saved=await store.imageInfo(meta.id,IMAGE_VERSION);
  if(saved)return saved;
  let running=flights.get(store);if(!running){running=new Map();flights.set(store,running);}
  if(running.has(meta.id))return running.get(meta.id);
  const task=limited(async()=>{
    const existing=await store.imageInfo(meta.id,IMAGE_VERSION);if(existing)return existing;
    let info=fallback(meta),outputs=[];
    if(meta.mime.startsWith('image/')) {
      let bytes=uploadedBytes;
      if(!bytes) {
        const file=await store.file(meta.id);
        if(!file)throw new Error('image_source_missing');
        if(file.size>MAX_FILE)await file.body.cancel();
        else bytes=new Uint8Array(await new Response(file.body).arrayBuffer());
      }
      if(bytes?.length&&bytes.length<=MAX_FILE) {
        try {
          const pipeline=sharp(bytes,{limitInputPixels:MAX_INPUT_PIXELS}).autoOrient();
          const metadata=await pipeline.metadata();
          const swapped=[5,6,7,8].includes(metadata.orientation);
          const width=swapped?metadata.height:metadata.width,height=swapped?metadata.width:metadata.height;
          if(!width||!height||width*height>MAX_INPUT_PIXELS)throw new Error('image_pixels');
          info={version:IMAGE_VERSION,width,height,presets:{}};
          for(const name of IMAGE_PRESETS) {
            const resize=name==='preview'?{width:640,height:960,fit:'inside',withoutEnlargement:true}:{width:1920,withoutEnlargement:true};
            const {data,info:result}=await pipeline.clone().resize(resize).webp({quality:name==='preview'?86:90}).toBuffer({resolveWithObject:true});
            // Re-encoding a small, already efficient image needlessly reduces quality.
            if(data.length>=bytes.length*.9)info.presets[name]={...originalPreset(meta),width,height};
            else {info.presets[name]={source:'variant',mime:'image/webp',size:data.length,width:result.width,height:result.height};outputs.push({name,data});}
          }
        }catch{
          // Historic PDFs and signature-only fixtures retain their original readable route.
          info=fallback(meta);outputs=[];
        }
      }
    }
    for(const output of outputs)await store.saveVariant(meta.id,IMAGE_VERSION,output.name,output.data);
    await store.saveImageInfo(meta.id,IMAGE_VERSION,info);
    // A different Function may have won the same immutable pathname; use its result.
    return await store.imageInfo(meta.id,IMAGE_VERSION)||info;
  });
  running.set(meta.id,task);
  try{return await task;}finally{if(running.get(meta.id)===task)running.delete(meta.id);}
}

export async function imageVariant(store,meta,preset,head=false) {
  const info=await ensureImageVariants(store,meta),selected=info.presets[preset];
  if(selected.source==='original')return {meta:{...meta,...selected},file:head?null:await store.file(meta.id)};
  const file=head?null:await store.variant(meta.id,IMAGE_VERSION,preset);
  if(!head&&!file)throw new Error('image_variant_missing');
  return {meta:{...meta,...selected},file};
}
