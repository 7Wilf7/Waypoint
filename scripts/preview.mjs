import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {safeHandle} from '../server/api.js';
import {LocalStore} from '../server/local-store.js';
try{process.loadEnvFile(resolve(import.meta.dirname,'../.env.local'));}catch(error){if(error.code!=='ENOENT')throw error;}
const store=new LocalStore(resolve(import.meta.dirname,'../.local/content'));

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const port = Number(process.env.WAYPOINT_PORT || 4173);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1:'+port);
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/')) {
      const headers=new Headers(request.headers);
      const chunks=[];
      for await(const chunk of request) {chunks.push(chunk);if(chunks.reduce((n,c)=>n+c.length,0)>9*1024*1024){response.writeHead(413).end();return;}}
      const result=await safeHandle(new Request(url,{method:request.method,headers,...(['GET','HEAD'].includes(request.method)?{}:{body:Buffer.concat(chunks)})}),store);
      response.writeHead(result.status,Object.fromEntries(result.headers));
      response.end(Buffer.from(await result.arrayBuffer()));
      return;
    }
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!path.startsWith(root + sep) || !(await stat(path)).isFile()) {
      response.writeHead(404).end('Not found');
      return;
    }
    const body = await readFile(path);
    response.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'Content-Length': body.length });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    response.writeHead(error.code === 'ENOENT' ? 404 : 400).end(error.code === 'ENOENT' ? 'Not found' : 'Bad request');
  }
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`Waypoint is running at http://127.0.0.1:${port}`));
