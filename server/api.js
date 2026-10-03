import {handleUpload} from '@vercel/blob/client';
import {BlobPreconditionFailedError} from '@vercel/blob';
import {ID,MAX_FILE,validateEntry,fileType} from './content.js';
import {isOwner,checkPassword,sessionCookie,sameOrigin,hasOwnerCookie,credentialSettings,changedCredentials} from './auth.js';
import {IMAGE_PRESETS,ensureImageVariants,imageVariant} from './image-variants.js';

const json=(value,status=200,headers={})=>Response.json(value,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff',...headers}});
async function readJson(request,limit=180000) {
  const raw=await request.text();
  if(raw.length>limit)throw new Error('entry_too_large');
  try{return JSON.parse(raw);}catch{throw new Error('invalid_entry');}
}
export async function handle(request,store,env=process.env) {
  const url=new URL(request.url),path=url.pathname;
  if(path==='/api/entries'&&request.method==='GET') {
    const kind=url.searchParams.get('kind');
    if(kind&&!['race','article'].includes(kind))return json({error:'invalid_kind'},400);
    return json({entries:(await store.entries()).filter(entry=>entry.published&&(!kind||entry.kind===kind))});
  }
  const authRecord=path==='/api/login'||hasOwnerCookie(request)?await store.auth():null;
  const credentials=credentialSettings(env,authRecord),owner=isOwner(request,credentials);
  if(path==='/api/session'&&request.method==='GET')return json({owner,uploads:store.mode});
  if(path==='/api/login'&&request.method==='POST') {
    if(!sameOrigin(request))return json({error:'same_origin_required'},403);
    if(!credentials.WAYPOINT_PASSWORD_HASH||!credentials.WAYPOINT_SESSION_SECRET)return json({error:'unavailable'},503);
    let data;try{data=await readJson(request,1000);}catch{return json({error:'invalid_password'},400);}
    if(!data||!checkPassword(data.password,credentials.WAYPOINT_PASSWORD_HASH))return json({error:'invalid_password'},401);
    return json({owner:true},200,{'set-cookie':sessionCookie(request,credentials)});
  }
  if(path==='/api/logout'&&request.method==='POST') {
    if(!sameOrigin(request))return json({error:'same_origin_required'},403);
    return json({owner:false},200,{'set-cookie':sessionCookie(request,env,true)});
  }
  if(path==='/api/manage/upload'&&request.method==='POST'&&store.mode==='blob') {
    let body;try{body=await readJson(request,10000);}catch{return json({error:'invalid_media'},400);}
    // Signed Blob callbacks have no owner cookie. The SDK verifies their signature.
    if(body.type!=='blob.upload-completed'&&(!owner||!sameOrigin(request)))return json({error:'owner_required'},403);
    try {
      const result=await handleUpload({request,body,
        onBeforeGenerateToken:async(pathname,clientPayload)=>{
          if(!owner||!sameOrigin(request))throw new Error('owner_required');
          const payload=JSON.parse(clientPayload||'{}');
          if(!ID.test(payload.id||'')||pathname!=='media/'+payload.id)throw new Error('invalid_media');
          return {allowedContentTypes:['image/jpeg','image/png','image/webp','application/pdf'],maximumSizeInBytes:MAX_FILE,addRandomSuffix:false,allowOverwrite:false,validUntil:Date.now()+15*60*1000};
        },onUploadCompleted:async()=>{}
      });
      return json(result);
    }catch{return json({error:'upload_failed'},400);}
  }
  if(path.startsWith('/api/manage/')) {
    if(!owner)return json({error:'owner_required'},403);
    if(request.method!=='GET'&&!sameOrigin(request))return json({error:'same_origin_required'},403);
  }
  if(path==='/api/manage/password'&&request.method==='POST') {
    let record;try{record=changedCredentials(await readJson(request,2500),credentials);}catch(error){return json({error:error.message},400);}
    try{await store.saveAuth(record,authRecord);}catch(error){
      if(error instanceof BlobPreconditionFailedError||error.message==='auth_changed'||error.message.includes('already exists'))return json({error:'auth_changed'},409);
      throw error;
    }
    return json({changed:true},200,{'set-cookie':sessionCookie(request,credentialSettings(env,record))});
  }
  if(path==='/api/manage/entries'&&request.method==='GET')return json({entries:await store.entries()});
  const item=path.match(/^\/api\/manage\/entries\/([a-z0-9-]{1,64})$/i);
  if(item&&request.method==='PUT') {
    let entry;try{entry=validateEntry(await readJson(request));}catch(error){return json({error:error.message},400);}
    if(entry.id!==item[1])return json({error:'invalid_entry'},400);
    for(const id of [...entry.photos,...entry.certificates]) {
      const meta=await store.media(id);
      if(!meta||(entry.photos.includes(id)&&!meta.mime.startsWith('image/')))return json({error:'invalid_media'},400);
      if(entry.kind==='race'&&entry.certificates.includes(id)&&!meta.mime.startsWith('image/')) {
        const previous=(await store.entries()).find(saved=>saved.id===entry.id&&saved.kind==='race');
        if(!previous?.certificates.includes(id))return json({error:'certificate_image_required'},400);
      }
    }
    await store.saveEntry(entry);return json({entry});
  }
  const upload=path.match(/^\/api\/manage\/media\/([a-z0-9-]{1,64})$/i);
  if(upload&&((store.mode==='local'&&request.method==='PUT')||request.method==='POST')) {
    const id=upload[1];let bytes,filename;
    if(request.method==='PUT') {
      if(Number(request.headers.get('content-length'))>MAX_FILE)return json({error:'file_too_large'},413);
      bytes=new Uint8Array(await request.arrayBuffer());filename=url.searchParams.get('name')||'';
    }else {
      let data;try{data=await readJson(request,1000);}catch{return json({error:'invalid_media'},400);}
      filename=typeof data.filename==='string'?data.filename:'';
      const file=await store.file(id);
      if(!file)return json({error:'invalid_media'},400);
      if(file.size>MAX_FILE){await file.body.cancel();return json({error:'file_too_large'},413);}
      bytes=new Uint8Array(await new Response(file.body).arrayBuffer());
    }
    if(!bytes.length||bytes.length>MAX_FILE)return json({error:'file_too_large'},413);
    const mime=fileType(bytes);if(!mime)return json({error:'file_type'},400);
    if(request.method==='PUT') {
      try{await store.saveFile(id,bytes);}catch(error){if(error.message==='media_exists')return json({error:'media_exists'},409);throw error;}
    }
    const meta={id,mime,filename:filename.trim().slice(0,160),size:bytes.length};
    const info=await ensureImageVariants(store,meta,bytes);
    await store.saveMedia({...meta,...(info.width?{width:info.width,height:info.height}:{})});return json({id});
  }
  const media=path.match(/^\/media\/([a-z0-9-]{1,64})$/i);
  if(media&&['GET','HEAD'].includes(request.method)) {
    const id=media[1],preset=url.searchParams.get('size'),head=request.method==='HEAD';
    const references=entry=>entry?.published&&(entry.photos.includes(id)||entry.certificates.includes(id));
    const publishers=owner?[]:(await store.entries()).filter(references);
    const candidates=publishers.map(entry=>entry.id).filter(candidate=>ID.test(candidate||''));
    const authorized=async()=>{
      if(owner)return true;
      // Request-local candidates avoid a second full catalog read, without caching permission.
      if(candidates.length&&store.entry&&(await Promise.all(candidates.map(candidate=>store.entry(candidate)))).some(references))return true;
      // A different entry may have published the shared photo while the candidates withdrew it.
      return (await store.entries()).some(references);
    };
    const notFound=()=>new Response('Not found',{status:404,headers:{'cache-control':'private, no-store'}});
    if(!owner&&!publishers.length)return notFound();
    if(preset!==null&&!IMAGE_PRESETS.includes(preset))return json({error:'invalid_image_size'},400);
    let meta=await store.media(id);if(!meta)return notFound();
    let file;
    if(preset!==null)({meta,file}=await imageVariant(store,meta,preset,head));
    else file=head?null:await store.file(id);
    if(request.method==='GET'&&!file)return notFound();
    // Encoding or a private-store read can race with publication withdrawal.
    if(!await authorized()){await file?.body?.cancel();return notFound();}
    // Stream large photos; do not buffer the response inside a Vercel Function.
    return new Response(file?.body||null,{headers:{'content-type':meta.mime,'content-length':String(meta.size),'cache-control':'private, no-store','x-content-type-options':'nosniff',...(meta.width?{'x-image-width':String(meta.width),'x-image-height':String(meta.height)}:{}),...(meta.mime==='application/pdf'?{'content-disposition':'inline; filename="certificate.pdf"'}:{})}});
  }
  return json({error:'not_found'},404);
}
export async function safeHandle(request,store,env=process.env) {
  try{return await handle(request,store,env);}catch(error){console.error('Waypoint request failed',error.name);return json({error:'unavailable'},503);}
}
