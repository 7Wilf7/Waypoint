import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {safeHandle} from '../server/api.js';
import {LocalStore} from '../server/local-store.js';
if(!process.env.WAYPOINT_LOCAL_DIRECTORY)try{process.loadEnvFile(resolve(import.meta.dirname,'../.env.local'));}catch(error){if(error.code!=='ENOENT')throw error;}
const store=new LocalStore(process.env.WAYPOINT_LOCAL_DIRECTORY||resolve(import.meta.dirname,'../.local/content'));

const previewBuild=process.env.WAYPOINT_PREVIEW_BUILD==='1';
const root = resolve(dirname(fileURLToPath(import.meta.url)), previewBuild?'../public':'../dist');
const publication=previewBuild?JSON.parse(await readFile(resolve(import.meta.dirname,'../server/publication-build.json'),'utf8')):{source:'live',mode:'live',lifecycle:null};
const config=previewBuild?await import(new URL('../public/publication-config.js',import.meta.url)):await import(new URL('../dist/publication-config.js',import.meta.url));
const runtimeEnv={...process.env,WAYPOINT_CONTENT_DELIVERY:config.publicationMode,WAYPOINT_PUBLICATION_BUILD:publication};
const port = Number(process.env.WAYPOINT_PORT || 4173);
const host = process.env.WAYPOINT_HOST || '127.0.0.1';
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg' };

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1:'+port);
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/')) {
      const headers=new Headers(request.headers);
      const chunks=[];
      for await(const chunk of request) {chunks.push(chunk);if(chunks.reduce((n,c)=>n+c.length,0)>9*1024*1024){response.writeHead(413).end();return;}}
      const result=await safeHandle(new Request(url,{method:request.method,headers,...(['GET','HEAD'].includes(request.method)?{}:{body:Buffer.concat(chunks)})}),store,runtimeEnv);
      response.writeHead(result.status,Object.fromEntries(result.headers));
      response.end(Buffer.from(await result.arrayBuffer()));
      return;
    }
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    let pathname = decodeURIComponent(url.pathname);
    if (['/manage.html','/manage/','/races.html','/races/'].includes(pathname)) {
      response.writeHead(308, {Location:(pathname.startsWith('/races')?'/races':'/manage')+url.search}).end();
      return;
    }
    if(pathname==='/manage')pathname='/manage.html';
    if(pathname==='/races')pathname='/races.html';
    const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!path.startsWith(root + sep) || !(await stat(path)).isFile()) {
      response.writeHead(404).end('Not found');
      return;
    }
    const body = await readFile(path);
    if (['.mp3','.m4a','.ogg'].includes(extname(path))) {
      const headers = {'Content-Type': mime[extname(path)], 'Cache-Control': 'no-cache', 'Accept-Ranges': 'bytes'};
      if (request.headers.range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
        const start = match?.[1] ? Number(match[1]) : Math.max(0, body.length - Number(match?.[2]));
        const end = match?.[1] && match?.[2] ? Math.min(Number(match[2]), body.length - 1) : body.length - 1;
        if (!match || !Number.isSafeInteger(start) || start < 0 || start >= body.length || end < start) {
          response.writeHead(416, {...headers, 'Content-Range': 'bytes */' + body.length}).end();
          return;
        }
        const chunk = body.subarray(start, end + 1);
        response.writeHead(206, {...headers, 'Content-Range': `bytes ${start}-${end}/${body.length}`, 'Content-Length': chunk.length});
        response.end(request.method === 'HEAD' ? undefined : chunk);
        return;
      }
      response.writeHead(200, {...headers, 'Content-Length': body.length});
      response.end(request.method === 'HEAD' ? undefined : body);
      return;
    }
    response.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'Cache-Control': pathname.startsWith('/published/')?'no-store':'no-cache', 'Content-Length': body.length });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    response.writeHead(error.code === 'ENOENT' ? 404 : 400).end(error.code === 'ENOENT' ? 'Not found' : 'Bad request');
  }
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(port, host, () => console.log(`Waypoint is running at http://${host}:${port}`));
