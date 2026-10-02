import { readFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { notes, notesByLanguage } from '../dist/content.js';
import { copy } from '../dist/i18n.js';
import {previewProducts,previewScreens,previewViewport} from '../dist/preview-screens.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
for (const filename of ['app.js', 'app-preview.js', 'preview-controller.js', 'preview-screens.js', 'content.js', 'i18n.js', 'motion.js', 'journal.js', 'article-layout.js', 'race-utils.js', 'race-archive.js', 'manage.js']) {
  const result = spawnSync(process.execPath, ['--check', resolve(root, filename)], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
}
const html = await readFile(resolve(root, 'index.html'), 'utf8');
const manager = await readFile(resolve(root, 'manage.html'), 'utf8');
const archive = await readFile(resolve(root, 'races.html'), 'utf8');
const translationKeys = Object.keys(copy.zh);
if (translationKeys.length !== Object.keys(copy.en).length) throw new Error('Translation editions differ');
for (const key of translationKeys) {
  if (!copy.en[key] || !copy.zh[key]) throw new Error('Missing translation: ' + key);
  if (/\p{Script=Han}/u.test(copy.en[key])) throw new Error('Untranslated English copy: ' + key);
}
for (const match of (html+manager+archive).matchAll(/data-i18n(?:-aria|-alt)?="([^"]+)"/g)) {
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
const nav=html.match(/<nav class="site-nav"[\s\S]*?<\/nav>/)[0];
const navIds=[...nav.matchAll(/href="#([^"]+)"/g)].map(match=>match[1]);
const sectionIds=[...html.matchAll(/<section[^>]+id="([^"]+)"/g)].map(match=>match[1]).filter(id=>navIds.includes(id));
if(navIds.join(',')!==sectionIds.join(','))throw new Error('Navigation order differs from page sections');
for(const [app,product] of Object.entries(previewProducts))for(const [view,label] of Object.entries(product.views))for(const locale of ['zh','en']) {
  const screen=previewScreens[app+'/'+view+'/'+locale];
  if(!screen||!copy[locale][label])throw new Error('Incomplete preview: '+app+'/'+view+'/'+locale);
  await access(resolve(root,screen.src));
  const png=await readFile(resolve(root,screen.src));
  if(png.toString('ascii',1,4)!=='PNG'||png.readUInt32BE(16)!==previewViewport.width*previewViewport.pixelRatio||png.readUInt32BE(20)!==previewViewport.height*previewViewport.pixelRatio)throw new Error('Preview resolution differs from its native 3x capture');
  if(screen.hotspots.filter(spot=>spot.navigation==='product').length!==5)throw new Error('Preview must include the five native product/settings entries');
  for(const spot of screen.hotspots) {
    if(!previewProducts[spot.app||app]?.views[spot.view]||!copy[locale][spot.label])throw new Error('Invalid preview target');
    const [x,y,width,height]=spot.bounds;
    if(x<0||y<0||width<=0||height<=0||x+width>100.01||y+height>100.01)throw new Error('Preview button is outside its screen');
  }
}
const previewTests=spawnSync(process.execPath,['--test',resolve(root,'../scripts/preview.test.mjs')],{encoding:'utf8'});
if(previewTests.status!==0)throw new Error(previewTests.stdout+previewTests.stderr);
const backend = spawnSync(process.execPath,['--test',resolve(root,'../scripts/api.test.mjs')],{encoding:'utf8'});
if(backend.status!==0)throw new Error(backend.stdout+backend.stderr);
const raceTests=spawnSync(process.execPath,['--test',resolve(root,'../scripts/races.test.mjs')],{encoding:'utf8'});
if(raceTests.status!==0)throw new Error(raceTests.stdout+raceTests.stderr);
const articleTests=spawnSync(process.execPath,['--test',resolve(root,'../scripts/articles.test.mjs')],{encoding:'utf8'});
if(articleTests.status!==0)throw new Error(articleTests.stdout+articleTests.stderr);
console.log('JavaScript syntax, assets, navigation, complete language dictionaries, and both reading editions passed.');
console.log('Interactive bilingual preview routes and interrupted product/language selections passed.');
console.log('Owner authorization, password changes and session revocation, publication visibility, file validation, draft media privacy, and input validation passed.');
console.log('Race categories, divisions, original dates, representative selection, result formatting, and archive ordering passed.');
console.log('Bilingual article paragraphs, inline photos, original publication times, and safe layout fallback after editing passed.');
