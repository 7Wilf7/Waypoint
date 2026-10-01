import { readFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { notes, notesByLanguage } from '../dist/content.js';
import { copy } from '../dist/i18n.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
for (const filename of ['app.js', 'content.js', 'i18n.js', 'motion.js', 'journal.js', 'manage.js']) {
  const result = spawnSync(process.execPath, ['--check', resolve(root, filename)], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
}
const html = await readFile(resolve(root, 'index.html'), 'utf8');
const manager = await readFile(resolve(root, 'manage.html'), 'utf8');
const translationKeys = Object.keys(copy.zh);
if (translationKeys.length !== Object.keys(copy.en).length) throw new Error('Translation editions differ');
for (const key of translationKeys) {
  if (!copy.en[key] || !copy.zh[key]) throw new Error('Missing translation: ' + key);
  if (/\p{Script=Han}/u.test(copy.en[key])) throw new Error('Untranslated English copy: ' + key);
}
for (const match of (html+manager).matchAll(/data-i18n(?:-aria|-alt)?="([^"]+)"/g)) {
  if (!copy.zh[match[1]] || !copy.en[match[1]]) throw new Error('Unknown translation: ' + match[1]);
}
for (const [locale, edition] of Object.entries(notesByLanguage)) {
  if (Object.keys(edition).length !== Object.keys(notes).length) throw new Error('Missing reading content: ' + locale);
  for (const [key, original] of Object.entries(notes)) {
    const note = edition[key];
    if (!note?.title || note.paragraphs.length !== original.paragraphs.length) throw new Error('Incomplete note: ' + locale + '/' + key);
    if (locale === 'en' && /\p{Script=Han}/u.test(JSON.stringify(note))) throw new Error('Untranslated English note: ' + key);
  }
}
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
for (const product of ['aevum','ultreia','viatica','sidera']) for (const locale of ['zh','en']) await access(resolve(root,'assets/app-'+product+'-'+locale+'.jpg'));
const backend = spawnSync(process.execPath,['--test',resolve(root,'../scripts/worker.test.mjs')],{encoding:'utf8'});
if(backend.status!==0)throw new Error(backend.stdout+backend.stderr);
console.log('JavaScript syntax, assets, navigation, complete language dictionaries, and both reading editions passed.');
console.log('Owner authorization, publication visibility, file validation, draft media privacy, and input validation passed.');
