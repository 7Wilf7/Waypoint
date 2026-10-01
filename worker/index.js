// Replaced by the deterministic build; assets never include source or local data.
import { assets } from './assets.js';

const ID = /^[a-z0-9-]{1,64}$/i;
const MAX_FILE = 8 * 1024 * 1024;
const json = (value, status = 200) => new Response(JSON.stringify(value), {status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const owner = (request, env) => Boolean(env.WAYPOINT_OWNER_EMAIL && request.headers.get('oai-authenticated-user-id') && request.headers.get('oai-authenticated-user-email')?.toLowerCase() === env.WAYPOINT_OWNER_EMAIL.toLowerCase());
const text = (value, limit = 60000) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10) === value;

export function validateEntry(input) {
  if (!input || !['race','article'].includes(input.kind) || !ID.test(input.id || '')) throw new Error('invalid_entry');
  const entry = {id:input.id,kind:input.kind,published:input.published === true,titleZh:text(input.titleZh,160),titleEn:text(input.titleEn,160),date:text(input.date,10),bodyZh:text(input.bodyZh),bodyEn:text(input.bodyEn),photos:[],certificates:[]};
  if (!entry.titleZh || !validDate(entry.date)) throw new Error('title_date_required');
  if (entry.published && (!entry.titleEn || (entry.bodyZh && !entry.bodyEn))) throw new Error('english_required');
  for (const field of ['photos','certificates']) {
    if (!Array.isArray(input[field]) || input[field].length > 20 || input[field].some(id=>!ID.test(id))) throw new Error('invalid_media');
    entry[field] = [...new Set(input[field])];
  }
  if (entry.kind === 'article') {
    if (entry.published && (!entry.bodyZh || !entry.bodyEn)) throw new Error('article_body_required');
    entry.wechatUrl = text(input.wechatUrl,2000);
    if (entry.wechatUrl) {
      let url;
      try {url = new URL(entry.wechatUrl);} catch {throw new Error('invalid_wechat_url');}
      if (url.protocol !== 'https:' || url.hostname !== 'mp.weixin.qq.com' || url.username || url.password) throw new Error('invalid_wechat_url');
    }
  } else {
    entry.category = ['Trail','Road','Hyrox','Spartan','Other'].includes(input.category) ? input.category : 'Trail';
    for (const field of ['distance','ascent']) {
      const number = input[field] === '' || input[field] == null ? null : Number(input[field]);
      if (number !== null && (!Number.isFinite(number) || number < 0 || number > (field === 'distance' ? 10000 : 100000))) throw new Error('invalid_metrics');
      entry[field] = number;
    }
    entry.result = text(input.result,20);
    if (entry.result && !/^\d{1,3}:[0-5]\d(?::[0-5]\d)?$/.test(entry.result)) throw new Error('invalid_result');
  }
  return entry;
}

function fileType(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if ([137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)) return 'image/png';
  const header = new TextDecoder().decode(bytes.slice(0,16));
  if (header.startsWith('RIFF') && header.slice(8,12) === 'WEBP') return 'image/webp';
  if (header.startsWith('%PDF-')) return 'application/pdf';
  return null;
}

async function listEntries(env, all = false) {
  const result = await env.DB.prepare(all ? 'SELECT payload FROM entries ORDER BY updated_at DESC' : 'SELECT payload FROM entries WHERE published = 1 ORDER BY updated_at DESC').all();
  return result.results.map(row=>JSON.parse(row.payload)).sort((a,b)=>b.date.localeCompare(a.date));
}

export async function handle(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path === '/api/session') return json({owner:owner(request,env)});
  if (path.startsWith('/api/manage/')) {
    if (!owner(request,env)) return json({error:'owner_required'},403);
    if (request.method !== 'GET' && (request.headers.get('origin') !== url.origin || request.headers.get('sec-fetch-site') === 'cross-site')) return json({error:'same_origin_required'},403);
  }
  if (path === '/api/entries' && request.method === 'GET') return json({entries:await listEntries(env)});
  if (path === '/api/manage/entries' && request.method === 'GET') return json({entries:await listEntries(env,true)});
  const item = path.match(/^\/api\/manage\/entries\/([a-z0-9-]{1,64})$/i);
  if (item && request.method === 'PUT') {
    const raw = await request.text();
    if (raw.length > 180000) return json({error:'entry_too_large'},413);
    let entry;
    try {entry = validateEntry(JSON.parse(raw));} catch(error) {return json({error:error.message},400);}
    if (entry.id !== item[1]) return json({error:'invalid_entry'},400);
    const mediaIds = [...entry.photos,...entry.certificates];
    for (const id of mediaIds) {
      const stored = await env.DB.prepare('SELECT mime FROM media WHERE id = ?').bind(id).first();
      if (!stored || (entry.photos.includes(id) && !stored.mime.startsWith('image/'))) return json({error:'invalid_media'},400);
    }
    await env.DB.prepare('INSERT INTO entries (id,kind,published,payload,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,published=excluded.published,payload=excluded.payload,updated_at=excluded.updated_at').bind(entry.id,entry.kind,entry.published ? 1 : 0,JSON.stringify(entry),new Date().toISOString()).run();
    return json({entry});
  }
  const upload = path.match(/^\/api\/manage\/media\/([a-z0-9-]{1,64})$/i);
  if (upload && request.method === 'PUT') {
    if (Number(request.headers.get('content-length')) > MAX_FILE) return json({error:'file_too_large'},413);
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.length > MAX_FILE || !bytes.length) return json({error:'file_too_large'},413);
    const mime = fileType(bytes);
    if (!mime) return json({error:'file_type'},400);
    const id = upload[1];
    if (await env.DB.prepare('SELECT id FROM media WHERE id = ?').bind(id).first()) return json({id});
    await env.BUCKET.put('media/'+id,bytes,{httpMetadata:{contentType:mime}});
    await env.DB.prepare('INSERT INTO media (id,mime,filename,size,created_at) VALUES (?,?,?,?,?)').bind(id,mime,text(url.searchParams.get('name'),160),bytes.length,new Date().toISOString()).run();
    return json({id});
  }
  const media = path.match(/^\/media\/([a-z0-9-]{1,64})$/i);
  if (media && ['GET','HEAD'].includes(request.method)) {
    const id = media[1];
    if (!owner(request,env)) {
      const entries = await listEntries(env);
      if (!entries.some(entry=>entry.photos.includes(id)||entry.certificates.includes(id))) return new Response('Not found',{status:404});
    }
    const meta = await env.DB.prepare('SELECT mime,size FROM media WHERE id = ?').bind(id).first();
    if (!meta) return new Response('Not found',{status:404});
    const object = await env.BUCKET.get('media/'+id);
    if (!object) return new Response('Not found',{status:404});
    return new Response(request.method === 'HEAD' ? null : object.body,{headers:{'content-type':meta.mime,'content-length':String(meta.size),'cache-control':'private, max-age=3600','x-content-type-options':'nosniff',...(meta.mime==='application/pdf'?{'content-disposition':'inline; filename="certificate.pdf"'}:{})}});
  }
  if (path.startsWith('/api/')) return json({error:'not_found'},404);
  const key = path === '/' ? '/index.html' : path;
  const asset = assets[key];
  if (!asset || !['GET','HEAD'].includes(request.method)) return new Response('Not found',{status:404});
  const bytes = Uint8Array.from(atob(asset.data),c=>c.charCodeAt(0));
  return new Response(request.method === 'HEAD' ? null : bytes,{headers:{'content-type':asset.type,'cache-control':key.includes('/assets/') ? 'public, max-age=86400' : 'no-cache','x-content-type-options':'nosniff'}});
}

export default {async fetch(request,env) {try {return await handle(request,env);} catch(error) {console.error('Waypoint request failed',error.name);return json({error:'unavailable'},503);}}};
