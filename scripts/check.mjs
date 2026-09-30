import { readFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { notes } from '../dist/content.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
for (const filename of ['app.js', 'content.js']) {
  const result = spawnSync(process.execPath, ['--check', resolve(root, filename)], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
}
const html = await readFile(resolve(root, 'index.html'), 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
if (new Set(ids).size !== ids.length) throw new Error('Duplicate HTML IDs');
for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
  if (match[1].startsWith('./')) await access(resolve(root, match[1]));
}
for (const match of html.matchAll(/href="#([^"/]+)"/g)) {
  if (!ids.includes(match[1])) throw new Error(`Missing section: ${match[1]}`);
}
for (const match of html.matchAll(/href="#read\/([^"]+)"/g)) {
  if (!notes[match[1]]) throw new Error(`Missing note: ${match[1]}`);
}
for (const note of Object.values(notes)) {
  for (const product of note.products || []) await access(resolve(root, product.image));
}
console.log('JavaScript syntax, local assets, section links, and reading content passed.');
