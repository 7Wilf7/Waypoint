import {mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {handle} from '../server/api.js';
import {exportPublished} from './export-public.mjs';
import {createPublicationFixture} from './public-fixture.mjs';

const root=resolve(import.meta.dirname,'..'),directory=join(root,'.local/static-fixture');
const evidence=join(root,'verification/static-public');
await mkdir(evidence,{recursive:true});
// Only this named fictional fixture is replaceable; production is never opened.
await rm(directory,{recursive:true,force:true});
const {store}=await createPublicationFixture(join(directory,'private'),{races:32,articles:3,drafts:7});
let stats;
const reset=()=>stats={modeledBlobGET:0,modeledListPages:0,freshJSON:0,cachedEligibleGET:0,readBytes:0,freshJSONBytes:0,cachedEligibleBytes:0,privateWrites:0};
const read=store.read.bind(store),entries=store.entries.bind(store),write=store.write.bind(store);
store.read=async path=>{
  const fresh=path.startsWith('entry-')||path.startsWith('meta-')||path==='auth.json';
  stats.modeledBlobGET++;fresh?stats.freshJSON++:stats.cachedEligibleGET++;
  const bytes=await read(path),size=bytes?.length||0;stats.readBytes+=size;
  fresh?stats.freshJSONBytes+=size:stats.cachedEligibleBytes+=size;return bytes;
};
store.entries=()=>{stats.modeledListPages++;return entries();};
store.write=(...args)=>{stats.privateWrites++;return write(...args);};
const live={};
const statics={WAYPOINT_PUBLIC_SOURCE:'local',WAYPOINT_CONTENT_DELIVERY:'static',WAYPOINT_PUBLICATION_BUILD:{source:'local',mode:'static',lifecycle:null}};
const request=async(path,env)=>{
  const response=await handle(new Request('http://waypoint.test'+path),store,env);
  return {status:response.status,bytes:(await response.arrayBuffer()).byteLength};
};
reset();
const snapshot=join(directory,'published'),summary=await exportPublished(store,snapshot),exportCost={...stats};
const data=JSON.parse(await readFile(join(snapshot,'catalog.json'),'utf8'));
const asset=(id,preset)=>readFile(join(snapshot,data.media[id][preset].replace('/published/','')));
const staticFiles=async names=>{
  let bytes=0;for(const name of names)bytes+=(await readFile(join(snapshot,name))).length;
  return bytes;
};
const results=[];
async function scenario(name,oldPaths,newFiles,{images=0,pdf=false}={}) {
  reset();let oldBytes=0;
  for(const path of oldPaths){const response=await request(path,live);if(response.status!==200)throw new Error(name+':live_failed');oldBytes+=response.bytes;}
  const before={...stats,contentHTTP:oldPaths.length,imageHTTP:images,pdfHTTP:pdf?1:0,clientBodyBytes:oldBytes};
  reset();let newBytes=await staticFiles(newFiles);
  if(pdf){const response=await request('/media/fixture-legacy-pdf?entry=fixture-race-1&format=pdf',statics);if(response.status!==200)throw new Error('static_pdf_failed');newBytes+=response.bytes;}
  results.push({name,before,after:{...stats,contentHTTP:newFiles.length+(pdf?1:0),imageHTTP:images,pdfHTTP:pdf?1:0,clientBodyBytes:newBytes}});
}
await scenario('homepage_hero_only',['/api/session'],[]);
// Session is still one HTTP request in the static homepage, independently of content.
reset();const session=await request('/api/session',statics);
Object.assign(results[0].after,{...stats,contentHTTP:1,clientBodyBytes:session.bytes});
await scenario('catalog_and_one_visible_preview',['/api/entries','/media/fixture-primary?entry=fixture-race-0&size=preview'],['catalog.json',data.media['fixture-primary'].preview.replace('/published/','')],{images:1});
await scenario('article_from_loaded_catalog',[],[]);
await scenario('race_reader_two_photos',['/media/fixture-primary?entry=fixture-race-0&size=read','/media/fixture-secondary?entry=fixture-race-0&size=read'],['primary','secondary'].map(role=>data.media['fixture-'+role].read.replace('/published/','')),{images:2});
await scenario('full_size_image_link',['/media/fixture-primary?entry=fixture-race-0'],[data.media['fixture-primary'].original.replace('/published/','')],{images:1});
await scenario('race_archive_collapsed',['/api/entries?kind=race'],['races.json']);
await scenario('legacy_pdf_link',['/media/fixture-legacy-pdf?entry=fixture-race-1'],[],{pdf:true});
reset();const redirect=await request('/api/entries',statics);
const report={type:'fictional LocalStore measured calls mapped to existing BlobStore methods; not real Blob/CDN billing',fixture:{published:35,drafts:7,images:3,livePDFs:1},units:'uncompressed response body bytes; HTTP headers, list payloads, shared frontend/font/audio assets excluded',results,
  export:{summary,cost:exportCost},compatibilityRedirect:{status:redirect.status,modeledStorage:{...stats},extraHTTP:1},
  realSiteEstimate:{savedEntries:'N unknown, N >= 35',catalogBefore:'N fresh JSON GET + list pages',catalogAfter:'0 Blob GET, 0 Blob list; 1 static JSON HTTP request',preparedImageBefore:'3 fresh JSON GET + 1 cached-eligible info GET + 1 cached-eligible image GET; 1 browser image request',staticImageAfter:'0 Blob GET, 0 Blob list; 1 static image HTTP request',monthlyBaseline14736:'historical rolling 30-day observation, not current usage or post-fix daily usage',realTransferBytes:'not measured'}};
await writeFile(join(evidence,'request-comparison.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({fixture:report.fixture,results:results.map(item=>({name:item.name,before:{GET:item.before.modeledBlobGET,list:item.before.modeledListPages,bytes:item.before.clientBodyBytes},after:{GET:item.after.modeledBlobGET,list:item.after.modeledListPages,bytes:item.after.clientBodyBytes}})),export:summary}));
