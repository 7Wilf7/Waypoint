import {cp,mkdir,rm,readdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {build} from 'esbuild';
const root=resolve(import.meta.dirname,'..');
await build({stdin:{contents:"export {upload} from '@vercel/blob/client';",resolveDir:root,sourcefile:'upload-client-entry.js'},bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,outfile:resolve(root,'dist/upload-client.js')});
await rm(resolve(root,'public'),{recursive:true,force:true});
await mkdir(resolve(root,'public'),{recursive:true});
for(const file of await readdir(resolve(root,'dist'),{withFileTypes:true})) {
  if((file.isDirectory()&&file.name==='assets')||(file.isFile()&&['.html','.css','.js','.svg'].includes(extname(file.name))))await cp(resolve(root,'dist',file.name),resolve(root,'public',file.name),{recursive:true});
}
console.log('Built public frontend and bundled direct-upload client.');
