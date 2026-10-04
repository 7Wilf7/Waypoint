import {copy} from './i18n.js';
import {initTheme} from './theme.js';
import {initElasticDetails} from './elastic-details.js';
import {raceCategories,raceCategoryKeys,sortRaces,raceCounts,formatResult,subtypeLabel,fastestRace} from './race-utils.js';
import {requestJSON,renderLoading,clearLoading,createMediaImage,clearMedia} from './loading.js';
import {mediaURL} from './media-images.js';
const root=document.documentElement;
const theme=initTheme();
initElasticDetails();
const list=document.querySelector('.race-archive-results'),filters=document.querySelector('.race-filters'),status=document.querySelector('.race-archive-status');
const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!=null)node.textContent=text;return node;};
const locale=()=>root.dataset.language==='en'?'en':'zh',words=()=>copy[locale()];
let races=[],failed=false,loading=true,request=null,errorKey='unavailable';
const category=()=>{const value=new URL(location.href).searchParams.get('category');return raceCategories.includes(value)?value:'all';};
const raceName=entry=>locale()==='en'?entry.titleEn:entry.titleZh;
const dateLabel=date=>new Intl.DateTimeFormat(locale()==='en'?'en-GB':'zh-CN',{month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(date+'T00:00:00Z'));
const fullDate=date=>new Intl.DateTimeFormat(locale()==='en'?'en-GB':'zh-CN',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'}).format(new Date(date+'T00:00:00Z'));

function syncPreferences(){
  const w=words();root.lang=locale()==='en'?'en':'zh-CN';document.title=w.raceArchiveDocumentTitle;
  document.querySelectorAll('[data-i18n]').forEach(node=>node.textContent=w[node.dataset.i18n]);
  document.querySelectorAll('[data-i18n-aria]').forEach(node=>node.setAttribute('aria-label',w[node.dataset.i18nAria]));
  const language=document.querySelector('.language-toggle');language.textContent=locale()==='en'?'中':'EN';language.setAttribute('aria-label',w.languageLabel);language.title=w.languageLabel;
  theme.sync();
  document.querySelector('meta[name="description"]').content=w.raceArchiveIntro;
}
document.querySelector('.language-toggle').addEventListener('click',()=>{root.dataset.language=locale()==='en'?'zh':'en';try{localStorage.setItem('waypoint-language',root.dataset.language);}catch{}syncPreferences();renderFilters();renderResults();});
window.addEventListener('storage',event=>{if(event.key==='waypoint-language'&&['zh','en'].includes(event.newValue)){root.dataset.language=event.newValue;syncPreferences();renderFilters();renderResults();}});

function renderFilters(){
  const counts=raceCounts(races),w=words();filters.replaceChildren();
  for(const value of ['all',...raceCategories.filter(value=>loading||counts[value]||value===category())]){
    const button=el('button','race-filter');button.type='button';button.dataset.category=value;
    button.disabled=loading||failed;
    button.append(el('span','',value==='all'?w.raceAll:w[raceCategoryKeys[value]]));
    const count=el('span','race-filter-count',!loading&&!failed?String(value==='all'?races.length:counts[value]):'\u00a0\u00a0');
    if(loading||failed)count.setAttribute('aria-hidden','true');button.append(count);
    button.addEventListener('click',()=>{if(category()===value)return;const url=new URL(location.href);value==='all'?url.searchParams.delete('category'):url.searchParams.set('category',value);history.pushState(null,'',url.pathname+url.search);renderResults();});filters.append(button);
  }
}
function renderDetails(entry,details){
  const w=words(),metadata=el('dl','archive-record-metrics');
  for(const [name,value]of [[w.date,fullDate(entry.date)],[w.raceCategory,w[raceCategoryKeys[entry.category]]],[w.raceSubtype,subtypeLabel(entry,locale())],[w.raceResult,formatResult(entry.result)||w.raceResultMissing],[w.raceDistance,entry.distance!=null?entry.distance+' km':null],[w.raceAscent,entry.ascent!=null?'+'+entry.ascent+' m':null]])if(value){const pair=el('div','');pair.append(el('dt','',name),el('dd','',value));metadata.append(pair);}
  details.append(metadata);
  const body=locale()==='en'?entry.bodyEn:entry.bodyZh;
  for(const text of body?.split(/\n\s*\n/).filter(Boolean)||[])details.append(el('p','archive-record-body',text));
  if(entry.photos.length){const gallery=el('div','reader-gallery');for(const [i,id]of entry.photos.entries())gallery.append(createMediaImage('/media/'+id,raceName(entry)+' · '+w.galleryPhoto+' '+(i+1),{entry:entry.id}));details.append(gallery);}
  if(entry.certificates.length){const certificates=el('div','reader-certificates');certificates.append(el('h3','',w.raceCertificates));for(const[i,id]of entry.certificates.entries()){const link=el('a','button button-quiet',w.viewMedia+' '+(i+1));link.href=mediaURL('/media/'+id,entry.id);link.target='_blank';link.rel='noopener';certificates.append(link);}details.append(certificates);}
  if(!body&&!entry.photos.length&&!entry.certificates.length)details.append(el('p','archive-media-empty',w.raceMediaEmpty));
}
function renderResults(){
  const selected=category(),w=words(),filtered=races.filter(entry=>selected==='all'||entry.category===selected);
  const expanded=new Set(Array.from(list.querySelectorAll('.archive-race[open]')).map(node=>node.dataset.raceId));
  for(const button of filters.children)button.setAttribute('aria-pressed',String(button.dataset.category===selected));
  status.removeAttribute('data-i18n');
  if(loading){status.textContent=w.racesLoading;document.querySelector('.race-archive-best').hidden=true;renderLoading(list,'racesLoading',{rows:4});return;}
  clearLoading(list);
  status.textContent=w.raceFilterSummary.replace('{category}',selected==='all'?w.raceAll:w[raceCategoryKeys[selected]]).replace('{count}',filtered.length);
  const best=['10K','Half Marathon','Marathon'].includes(selected)?fastestRace(filtered):null;
  const personalBest=document.querySelector('.race-archive-best');personalBest.hidden=!best;personalBest.textContent=best?w.racePersonalBest+' · '+formatResult(best.result):'';
  clearMedia(list);list.replaceChildren();
  if(failed||!filtered.length){if(failed)status.textContent=w[errorKey];list.append(el('p','journal-empty',failed?w[errorKey]:w.raceEmpty));if(failed){const retry=el('button','button button-quiet',w.retry);retry.addEventListener('click',load);list.append(retry);}return;}
  const years=[...new Set(filtered.map(entry=>entry.date.slice(0,4)))];
  for(const year of years){
    const yearRaces=filtered.filter(entry=>entry.date.startsWith(year)),section=el('section','race-year');
    const heading=el('div','race-year-heading');heading.append(el('h2','',year),el('span','',yearRaces.length+' '+w.raceInYear));section.append(heading);
    for(const entry of yearRaces){
      const record=el('details','archive-race'),summary=el('summary','archive-race-summary');record.dataset.category=entry.category;record.dataset.raceId=entry.id;
      record.open=expanded.has(entry.id);
      const time=el('time','archive-race-date',dateLabel(entry.date));time.dateTime=entry.date;
      const title=el('div','archive-race-title');title.append(el('span','race-format-tag',[w[raceCategoryKeys[entry.category]],subtypeLabel(entry,locale())].filter(Boolean).join(' · ')),el('h3','',raceName(entry)));
      const metrics=[entry.distance!=null?entry.distance+' km':null,entry.ascent!=null?'+'+entry.ascent+' m':null].filter(Boolean).join(' · ');if(metrics)title.append(el('p','archive-race-course',metrics));
      summary.append(time,title,el('strong','archive-race-result',formatResult(entry.result)||w.raceResultMissing),el('span','archive-race-arrow','↗'));
      const body=el('div','archive-race-detail');renderDetails(entry,body);record.append(summary,body);section.append(record);
    }list.append(section);
  }
}
window.addEventListener('popstate',renderResults);
function load(event){
  if(request)return request;
  const keyboard=event?.detail===0;
  loading=true;failed=false;renderFilters();renderResults();
  request=(async()=>{
    try{const data=await requestJSON('/api/entries?kind=race');if(!Array.isArray(data.entries))throw new Error('unavailable');races=sortRaces(data.entries);}
    catch(error){failed=true;errorKey=error.message==='request_timeout'?'loadTimedOut':'unavailable';}
    finally{loading=false;request=null;renderFilters();renderResults();if(keyboard)list.querySelector('summary,button')?.focus({preventScroll:true});}
  })();
  return request;
}
document.querySelector('.site-nav a[href="/#trails"]').setAttribute('aria-current','page');
const header=document.querySelector('.site-header');new ResizeObserver(()=>root.style.setProperty('--race-header-bottom',Math.ceil(header.getBoundingClientRect().bottom)+'px')).observe(header);
syncPreferences();await load();
