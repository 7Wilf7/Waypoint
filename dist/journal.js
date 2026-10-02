import {copy} from './i18n.js';
import {raceCategories,raceCategoryKeys,subtypeLabel,formatResult,sortRaces,representativeRace,raceCounts} from './race-utils.js';
import {articleReading,articleParagraphs} from './article-layout.js';
const root=document.documentElement;
const words=()=>copy[root.dataset.language==='en'?'en':'zh'];
let entries=[];
let failed=false;
const el=(tag,className,text)=>{const element=document.createElement(tag);if(className)element.className=className;if(text)element.textContent=text;return element;};
export function getEntry(id) {
  const entry=entries.find(item=>item.id===id);
  if(!entry)return null;
  const en=root.dataset.language==='en';
  const body=en?entry.bodyEn:entry.bodyZh;
  const metrics=entry.kind==='race'?[subtypeLabel(entry,en?'en':'zh'),entry.distance!=null?entry.distance+' km':null,entry.ascent!=null?'+'+entry.ascent+' m':null,formatResult(entry.result)||words().raceResultMissing].filter(Boolean).join(' / '):words().channelLabel;
  const reading=entry.kind==='article'?articleReading(entry,en?'en':'zh'):{paragraphs:articleParagraphs(body),photos:entry.photos};
  return {title:en?entry.titleEn:entry.titleZh,category:entry.kind==='race'?words()[raceCategoryKeys[entry.category]]||words().raceRecord:words().channelLabel,lead:formatDate(entry.date)+(entry.kind==='article'&&entry.publishedTime?' '+entry.publishedTime:'')+(metrics?' · '+metrics:''),...reading,certificates:entry.certificates,link:entry.wechatUrl?{href:entry.wechatUrl,label:words().wechatRead}:null,kind:entry.kind};
}
function formatDate(date){return new Intl.DateTimeFormat(root.dataset.language==='en'?'en-GB':'zh-CN',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'}).format(new Date(date+'T00:00:00Z'));}
function renderRaces(container) {
  container.replaceChildren();
  const races=sortRaces(entries);
  if(failed||!races.length){renderKind('race',container);return;}
  const w=words(),locale=root.dataset.language==='en'?'en':'zh',counts=raceCounts(races),formats=raceCategories.filter(category=>counts[category]);
  const overview=el('div','race-overview');
  const span=races.at(-1).date.slice(0,4)+'—'+races[0].date.slice(0,4);
  for(const [value,label]of [[races.length,w.raceRecorded],[formats.length,w.raceFormats],[span,w.raceYears]]){const item=el('div','race-overview-stat');item.append(el('strong','',String(value)),el('span','',label));overview.append(item);}
  container.append(overview);
  const selected=representativeRace(races,counts.Trail?'Trail':races[0].category).entry;
  const feature=el('a','race-card race-spotlight');feature.href='#entry/'+selected.id;
  if(selected.photos.length){const image=el('img','race-spotlight-photo');image.src='./media/'+selected.photos[0];image.alt=getEntry(selected.id).title;image.loading='lazy';feature.append(image);}
  const top=el('div','race-spotlight-top');top.append(el('span','race-format-tag',w[raceCategoryKeys[selected.category]]),el('span','eyebrow',w.raceLatestRecord));
  const content=el('div','race-spotlight-content');content.append(el('p','race-feature-date',formatDate(selected.date)),el('h3','',getEntry(selected.id).title),el('span','race-feature-result',formatResult(selected.result)||w.raceResultMissing));
  const metrics=el('div','race-feature-metrics');for(const [value,label]of [[selected.distance!=null?selected.distance+' km':null,w.raceDistance],[selected.ascent!=null?'+'+selected.ascent+' m':null,w.raceAscent]])if(value){const item=el('div','');item.append(el('strong','',value),el('span','',label));metrics.append(item);}
  content.append(metrics);feature.append(top,content,el('span','race-feature-link',w.raceDetails+' ↗'));
  const highlights=el('div','race-highlights');
  for(const category of formats.filter(category=>category!==selected.category)){
    const {entry,label}=representativeRace(races,category),link=el('a','race-card race-highlight');link.href='#entry/'+entry.id;
    const heading=el('div','race-highlight-heading');heading.append(el('span','race-format-tag',w[raceCategoryKeys[category]]),el('span','race-highlight-context',[w[label],subtypeLabel(entry,locale)].filter(Boolean).join(' · ')));
    link.append(heading,el('strong','race-highlight-result',formatResult(entry.result)||w.raceResultMissing),el('span','race-highlight-name',getEntry(entry.id).title));highlights.append(link);
  }
  const showcase=el('div','race-showcase');showcase.append(feature,highlights);container.append(showcase);
  const footer=el('div','race-showcase-footer');footer.append(el('p','',w.raceShowcaseNote));const archive=el('a','button button-quiet race-archive-link',w.raceViewAll.replace('{count}',races.length)+' ↗');archive.href='/races';footer.append(archive);container.append(footer);
}
function renderKind(kind,container) {
  container.replaceChildren();
  const selected=entries.filter(entry=>entry.kind===kind);
  if(failed||!selected.length) {
    const message=el('p','journal-empty',failed?words().unavailable:kind==='race'?words().raceEmpty:words().channelEmpty);
    container.append(message);
    if(failed){const retry=el('button','button button-quiet',words().retry);retry.addEventListener('click',initJournal);container.append(retry);}
    return;
  }
  for(const entry of selected) {
    const display=getEntry(entry.id);
    const card=el('a',kind==='race'?'journal-card race-card':'journal-card article-card');card.href='#entry/'+entry.id;
    if(entry.photos.length) {const image=el('img','journal-cover');image.src='./media/'+entry.photos[0];image.alt=display.title;image.loading='lazy';card.append(image);}
    const content=el('div','journal-card-content');content.append(el('span','eyebrow',formatDate(entry.date)),el('h3','',display.title));
    if(kind==='race')content.append(el('p','race-card-metrics',[entry.distance!=null?entry.distance+' km':null,entry.ascent!=null?'+'+entry.ascent+' m':null,entry.result].filter(Boolean).join(' / ')));
    else if(display.paragraphs.length)content.append(el('p','article-card-excerpt',display.paragraphs[0].slice(0,120)));
    content.append(el('span','journal-card-cta',kind==='race'?words().raceDetails:words().readThought));card.append(content);container.append(card);
  }
}
export function renderJournal(){renderRaces(document.querySelector('.race-entries'));renderKind('article',document.querySelector('.article-entries'));}
export async function initJournal() {
  try {const response=await fetch('./api/entries');if(!response.ok)throw new Error('unavailable');entries=(await response.json()).entries;failed=false;}catch{failed=true;}
  renderJournal();document.dispatchEvent(new Event('journal-ready'));
  try {const response=await fetch('./api/session');if(response.ok)document.querySelector('.manage-link').hidden=!(await response.json()).owner;}catch{/* The reader remains available without a management link. */}
}
