import { readFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { notes, notesByLanguage } from '../dist/content.js';
import { copy } from '../dist/i18n.js';
import { ambientTracks } from '../dist/ambient-tracks.js';
import {previewProducts,previewScreens,previewViewport} from '../dist/preview-screens.js';
import {analyticsCopy} from '../dist/analytics-copy.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
for (const filename of ['app.js', 'theme.js', 'homepage-copy.js', 'hero-gallery.js', 'hero-motion.js', 'surface-motion.js', 'scroll-motion.js', 'pointer-field.js', 'elastic-details.js', 'ambient-motion.js', 'ambient-audio.js', 'ambient-tracks.js', 'conductor.js', 'app-preview.js', 'preview-controller.js', 'preview-screens.js', 'content.js', 'i18n.js', 'motion.js', 'journal.js', 'article-layout.js', 'article-utils.js', 'race-utils.js', 'race-photos.js', 'race-archive.js', 'manage.js', 'loading.js', 'media-images.js', 'public-content.js', 'publication-config.js']) {
  const result = spawnSync(process.execPath, ['--check', resolve(root, filename)], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
}
for (const filename of ['analytics-config.js','analytics-copy.js','manage-analytics.js','owner-device.js','visit-browser.js','privacy-copy.js','privacy.js','visit-policy.js','visitor-session.js','visits.js','../server/analytics.js','../server/analytics-exclusions.js']) {
  const result=spawnSync(process.execPath,['--check',resolve(root,filename)],{encoding:'utf8'});
  if(result.status!==0)throw new Error(result.stderr);
}
function checkAnalyticsCopy(zh,en,path='analytics') {
  if(Object.keys(zh).sort().join(',')!==Object.keys(en).sort().join(','))throw new Error('Translation editions differ: '+path);
  for(const key of Object.keys(zh)) {
    if(typeof zh[key]==='object')checkAnalyticsCopy(zh[key],en[key],path+'.'+key);
    else if(!zh[key]||!en[key]||/\p{Script=Han}/u.test(en[key]))throw new Error('Missing analytics translation: '+path+'.'+key);
  }
}
checkAnalyticsCopy(analyticsCopy.zh,analyticsCopy.en);
const html = await readFile(resolve(root, 'index.html'), 'utf8');
const manager = await readFile(resolve(root, 'manage.html'), 'utf8');
const archive = await readFile(resolve(root, 'races.html'), 'utf8');
for (const track of ambientTracks) await access(resolve(root, 'assets/audio', track.id + '.m4a'));
const translationKeys = Object.keys(copy.zh);
if (translationKeys.length !== Object.keys(copy.en).length) throw new Error('Translation editions differ');
for (const key of translationKeys) {
  if (!copy.en[key] || !copy.zh[key]) throw new Error('Missing translation: ' + key);
  if (/\p{Script=Han}/u.test(copy.en[key])) throw new Error('Untranslated English copy: ' + key);
}
for (const match of (html+manager+archive).matchAll(/data-i18n(?:-aria|-alt|-roledescription)?="([^"]+)"/g)) {
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
for (const match of html.matchAll(/srcset="([^"]+)"/g)) {
  for (const candidate of match[1].split(',')) {
    const source = candidate.trim().split(/\s+/)[0];
    if (source.startsWith('./')) await access(resolve(root, source));
  }
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
const navIds=[...nav.matchAll(/href="\/?#([^"]+)"/g)].map(match=>match[1]);
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
const imageTests=spawnSync(process.execPath,['--test',resolve(root,'../scripts/image-variants.test.mjs')],{encoding:'utf8'});
if(imageTests.status!==0)throw new Error(imageTests.stdout+imageTests.stderr);
const raceTests=spawnSync(process.execPath,['--test',resolve(root,'../scripts/races.test.mjs')],{encoding:'utf8'});
if(raceTests.status!==0)throw new Error(raceTests.stdout+raceTests.stderr);
const articleTests=spawnSync(process.execPath,['--test',resolve(root,'../scripts/articles.test.mjs')],{encoding:'utf8'});
if(articleTests.status!==0)throw new Error(articleTests.stdout+articleTests.stderr);
const loadingTests=spawnSync(process.execPath,['--test',resolve(root,'../scripts/loading.test.mjs')],{encoding:'utf8'});
if(loadingTests.status!==0)throw new Error(loadingTests.stdout+loadingTests.stderr);
const audioTests=spawnSync(process.execPath,['--test',resolve(root,'../scripts/ambient-audio.test.mjs')],{encoding:'utf8'});
if(audioTests.status!==0)throw new Error(audioTests.stdout+audioTests.stderr);
const publicationTests=spawnSync(process.execPath,['--test',resolve(root,'../scripts/export-public.test.mjs'),resolve(root,'../scripts/public-delivery.test.mjs')],{encoding:'utf8'});
if(publicationTests.status!==0)throw new Error(publicationTests.stdout+publicationTests.stderr);
const analyticsTests=spawnSync(process.execPath,['--test',resolve(root,'../scripts/analytics.test.mjs')],{encoding:'utf8'});
if(analyticsTests.status!==0)throw new Error(analyticsTests.stdout+analyticsTests.stderr);
console.log('JavaScript syntax, assets, navigation, complete language dictionaries, and both reading editions passed.');
console.log('Interactive bilingual preview routes and interrupted product/language selections passed.');
console.log('Owner authorization, password changes and session revocation, publication visibility, file validation, draft media privacy, and input validation passed.');
console.log('Original image integrity, proportional previews, EXIF orientation, private variants, publication withdrawal, and bounded generation passed.');
console.log('Race categories, divisions, original dates, representative selection, result formatting, and archive ordering passed.');
console.log('Complete text-only articles, bilingual summaries, reading estimates, original times, stable article ordering, and fixed race photo roles passed.');
console.log('First-paint greeting, required playback/deadline, stored themes/languages, storage-denial recovery, bounded response bodies, and no automatic write replay passed.');
console.log('Deployment snapshots, draft/media isolation, no-store public delivery, strict live PDFs, Preview boundaries, and withdrawal-safe rebuilds passed.');
console.log('Owner-only visitor reporting, Shanghai day boundaries, URL redaction, visit preferences and bounded analytics queries passed.');
