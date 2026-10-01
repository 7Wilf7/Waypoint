import {readFile,writeFile,mkdir,cp,readdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};
const assets={};
async function collect(relative='') {
  for(const file of await readdir(resolve(root,'dist',relative),{withFileTypes:true})) {
    const key=(relative?relative+'/':'')+file.name;
    if(file.isDirectory()) {if(key==='assets'||key.startsWith('assets/')) await collect(key);}
    else if(types[extname(file.name)]) assets['/'+key]={type:types[extname(file.name)],data:(await readFile(resolve(root,'dist',key))).toString('base64')};
  }
}
await collect();
await mkdir(resolve(root,'dist/server'),{recursive:true});
const source=(await readFile(resolve(root,'worker/index.js'),'utf8')).replace("import { assets } from './assets.js';",'const assets = '+JSON.stringify(assets)+';');
await writeFile(resolve(root,'dist/server/index.js'),source);
await mkdir(resolve(root,'dist/.openai'),{recursive:true});
await cp(resolve(root,'.openai/hosting.json'),resolve(root,'dist/.openai/hosting.json'));
await cp(resolve(root,'drizzle'),resolve(root,'dist/.openai/drizzle'),{recursive:true});
console.log('Built Worker with '+Object.keys(assets).length+' public files.');
