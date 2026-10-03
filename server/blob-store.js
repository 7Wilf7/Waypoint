import {get,list,put} from '@vercel/blob';

// Drafts and original files always live in a private store. Only the API publishes them.
export class BlobStore {
  mode='blob';
  // Override only for isolated verification; the live owner record has a fixed path.
  constructor(authPath='settings/auth.json'){this.authPath=authPath;}
  async auth() {
    const result=await get(this.authPath,{access:'private',useCache:false});
    return result?{...await new Response(result.stream).json(),etag:result.blob.etag}:null;
  }
  async saveAuth(record,previous) {
    await put(this.authPath,JSON.stringify(record),{access:'private',addRandomSuffix:false,allowOverwrite:Boolean(previous),...(previous?{ifMatch:previous.etag}:{}),contentType:'application/json',cacheControlMaxAge:60});
  }
  async readJson(path) {
    const result=await get(path,{access:'private',useCache:false});
    return result?new Response(result.stream).json():null;
  }
  async writeJson(path,value) {
    await put(path,JSON.stringify(value),{access:'private',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json',cacheControlMaxAge:60});
  }
  async entries() {
    const blobs=[];let cursor;
    do {const page=await list({prefix:'entries/',limit:1000,cursor});blobs.push(...page.blobs);cursor=page.hasMore?page.cursor:undefined;}while(cursor);
    const entries=await Promise.all(blobs.map(blob=>this.readJson(blob.pathname)));
    return entries.filter(Boolean).sort((a,b)=>b.date.localeCompare(a.date));
  }
  saveEntry(entry){return this.writeJson('entries/'+entry.id+'.json',entry);}
  entry(id){return this.readJson('entries/'+id+'.json');}
  media(id){return this.readJson('metadata/'+id+'.json');}
  saveMedia(meta){return this.writeJson('metadata/'+meta.id+'.json',meta);}
  async file(id) {
    // UUID originals cannot be overwritten. Internal Blob caching never bypasses API auth.
    const result=await get('media/'+id,{access:'private'});
    return result?{body:result.stream,size:result.blob.size}:null;
  }
  async imageInfo(id,version){return this.readJson('image-variants/'+version+'/'+id+'/info.json');}
  async putImmutable(path,value,contentType) {
    try{await put(path,value,{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType});return true;}
    catch(error){
      // Concurrent Functions can encode the same image. The winner is always readable.
      const existing=await get(path,{access:'private',useCache:false});
      if(!existing)throw error;
      await existing.stream?.cancel();return false;
    }
  }
  saveImageInfo(id,version,info){return this.putImmutable('image-variants/'+version+'/'+id+'/info.json',JSON.stringify(info),'application/json');}
  saveVariant(id,version,preset,bytes){return this.putImmutable('image-variants/'+version+'/'+id+'/'+preset+'.webp',bytes,'image/webp');}
  async variant(id,version,preset){const result=await get('image-variants/'+version+'/'+id+'/'+preset+'.webp',{access:'private'});return result?{body:result.stream,size:result.blob.size}:null;}
}
