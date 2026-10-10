import {cp,mkdir,rm,readdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {build} from 'esbuild';
import {buildPublicationPolicy} from '../server/publication-policy.js';
import {exportPublished,publicationStore} from './export-public.mjs';
const root=resolve(import.meta.dirname,'..');
const policy=buildPublicationPolicy(process.env);
await build({stdin:{contents:"export {upload} from '@vercel/blob/client';",resolveDir:root,sourcefile:'upload-client-entry.js'},bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,outfile:resolve(root,'dist/upload-client.js')});
await build({stdin:{contents:"export {inject,pageview} from '@vercel/analytics';",resolveDir:root,sourcefile:'analytics-client-entry.js'},bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,outfile:resolve(root,'dist/analytics-client.js')});
await rm(resolve(root,'public'),{recursive:true,force:true});
await mkdir(resolve(root,'public'),{recursive:true});
for(const file of await readdir(resolve(root,'dist'),{withFileTypes:true})) {
  if((file.isDirectory()&&file.name==='assets')||(file.isFile()&&['.html','.css','.js','.svg'].includes(extname(file.name))))await cp(resolve(root,'dist',file.name),resolve(root,'public',file.name),{recursive:true});
}
await writeFile(resolve(root,'public/analytics-config.js'),'export const analyticsEnabled='+String(process.env.VERCEL_ENV==='production'&&Boolean(process.env.WAYPOINT_ANALYTICS_TOKEN&&process.env.WAYPOINT_ANALYTICS_PROJECT_ID))+';\n');
if(policy.mode==='static') {
  const summary=await exportPublished(await publicationStore(policy),resolve(root,'public/published'));
  await writeFile(resolve(root,'public/publication-config.js'),"export const publicationMode='static';\n");
  console.log('Built public deployment snapshot: '+JSON.stringify(summary));
}
// The Function bundles this generated policy; mismatch fails before any store read.
await writeFile(resolve(root,'server/publication-build.json'),JSON.stringify(policy));
console.log('Built public frontend and bundled direct-upload client ('+policy.mode+').');
