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
  media(id){return this.readJson('metadata/'+id+'.json');}
  saveMedia(meta){return this.writeJson('metadata/'+meta.id+'.json',meta);}
  async file(id) {
    const result=await get('media/'+id,{access:'private',useCache:false});
    return result?{body:result.stream,size:result.blob.size}:null;
  }
}
