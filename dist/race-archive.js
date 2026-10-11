import {copy} from './i18n.js';
import {raceCategories,raceCategoryKeys,sortRaces,raceCounts,formatResult,subtypeLabel,fastestRace} from './race-utils.js';
import {renderLoading,clearLoading,clearMedia} from './loading.js';
import {createRaceGallery} from './race-media.js';
import {requestPublishedEntries} from './public-content.js';
// The shell owns preferences and history; this renderer only touches its view.
export function initRaceArchive(scope,{navigate,locale}) {
const list=scope.querySelector('.race-archive-results'),filters=scope.querySelector('.race-filters'),status=scope.querySelector('.race-archive-status');
const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!=null)node.textContent=text;return node;};
const words=()=>copy[locale()];
let races=[],failed=false,loading=true,request=null,errorKey='unavailable',active=false;
let route=new URL('/races',location.origin);
const expanded=new Set();
const category=()=>{const value=route.searchParams.get('category');return raceCategories.includes(value)?value:'all';};
const raceName=entry=>locale()==='en'?entry.titleEn:entry.titleZh;
const dateLabel=date=>new Intl.DateTimeFormat(locale()==='en'?'en-GB':'zh-CN',{month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(date+'T00:00:00Z'));
const fullDate=date=>new Intl.DateTimeFormat(locale()==='en'?'en-GB':'zh-CN',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'}).format(new Date(date+'T00:00:00Z'));

function renderFilters(){
  if(!active)return;
  const counts=raceCounts(races),w=words();filters.replaceChildren();
  for(const value of ['all',...raceCategories.filter(value=>loading||counts[value]||value===category())]){
    const button=el('button','race-filter');button.type='button';button.dataset.category=value;
    button.disabled=loading||failed;
    button.append(el('span','',value==='all'?w.raceAll:w[raceCategoryKeys[value]]));
    const count=el('span','race-filter-count',!loading&&!failed?String(value==='all'?races.length:counts[value]):'\u00a0\u00a0');
    if(loading||failed)count.setAttribute('aria-hidden','true');button.append(count);
    button.addEventListener('click',event=>{if(category()===value)return;const url=new URL(route);value==='all'?url.searchParams.delete('category'):url.searchParams.set('category',value);navigate(url,{preserveScroll:true,keyboard:event.detail===0,origin:button});});filters.append(button);
  }
}
function renderDetails(entry,details){
  const w=words(),metadata=el('dl','archive-record-metrics');
  for(const [name,value]of [[w.date,fullDate(entry.date)],[w.raceCategory,w[raceCategoryKeys[entry.category]]],[w.raceSubtype,subtypeLabel(entry,locale())],[w.raceResult,formatResult(entry.result)||w.raceResultMissing],[w.raceDistance,entry.distance!=null?entry.distance+' km':null],[w.raceAscent,entry.ascent!=null?'+'+entry.ascent+' m':null]])if(value){const pair=el('div','');pair.append(el('dt','',name),el('dd','',value));metadata.append(pair);}
  details.append(metadata);
  const body=locale()==='en'?entry.bodyEn:entry.bodyZh;
  for(const text of body?.split(/\n\s*\n/).filter(Boolean)||[])details.append(el('p','archive-record-body',text));
  details.append(createRaceGallery(entry));
}
function renderResults(){
  if(!active)return;
  hidePreview();
  const selected=category(),w=words(),filtered=races.filter(entry=>selected==='all'||entry.category===selected);
  for(const button of filters.children)button.setAttribute('aria-pressed',String(button.dataset.category===selected));
  status.removeAttribute('data-i18n');
  if(loading){status.textContent=w.racesLoading;scope.querySelector('.race-archive-best').hidden=true;renderLoading(list,'racesLoading',{rows:4});return;}
  clearLoading(list);
  status.textContent=w.raceFilterSummary.replace('{category}',selected==='all'?w.raceAll:w[raceCategoryKeys[selected]]).replace('{count}',filtered.length);
  const best=['10K','Half Marathon','Marathon'].includes(selected)?fastestRace(filtered):null;
  const personalBest=scope.querySelector('.race-archive-best');personalBest.hidden=!best;personalBest.textContent=best?w.racePersonalBest+' · '+formatResult(best.result):'';
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
      const body=el('div','archive-race-detail');
      // Closed rows hold no image observers or requests. Opening loads this row only.
      if(record.open){renderDetails(entry,body);body.dataset.ready='true';}
      record.append(summary,body);section.append(record);
    }list.append(section);
  }
}
function load(event){
  if(request)return request;
  const keyboard=event?.detail===0;
  loading=true;failed=false;renderFilters();renderResults();
  request=(async()=>{
    try{const data=await requestPublishedEntries('race');if(!Array.isArray(data.entries))throw new Error('unavailable');races=sortRaces(data.entries);}
    catch(error){failed=true;errorKey=error.message==='request_timeout'?'loadTimedOut':'unavailable';}
    finally{loading=false;request=null;renderFilters();renderResults();if(active&&keyboard)list.querySelector('summary,button')?.focus({preventScroll:true});}
  })();
  return request;
}
function refresh(){
  if(!active)return;
  scope.querySelectorAll('[data-i18n]').forEach(node=>node.textContent=words()[node.dataset.i18n]);
  scope.querySelectorAll('[data-i18n-aria]').forEach(node=>node.setAttribute('aria-label',words()[node.dataset.i18nAria]));
  renderFilters();renderResults();
}
const preview=el('aside','archive-race-preview');preview.hidden=true;preview.inert=true;preview.setAttribute('aria-hidden','true');scope.append(preview);
const fine=matchMedia('(hover: hover) and (pointer: fine)');
let previewTimer=0,previewTarget=null,previewPoint=null;
function hidePreview(){
  clearTimeout(previewTimer);previewTimer=0;previewTarget=null;previewPoint=null;
  preview.hidden=true;clearMedia(preview);preview.replaceChildren();
}
function positionPreview(){
  if(preview.hidden||!previewPoint)return;
  const [x,y]=previewPoint,width=preview.offsetWidth,height=preview.offsetHeight;
  const headerBottom=document.querySelector('.site-header').getBoundingClientRect().bottom+12;
  const top=y+height+24<innerHeight?y+20:y-height-20;
  preview.style.left=Math.max(16,Math.min(x-width/2,innerWidth-width-16))+'px';
  preview.style.top=Math.max(headerBottom,Math.min(top,innerHeight-height-16))+'px';
}
function queuePreview(summary,point,keyboard=false){
  if(!active||!summary||summary.parentElement.open||innerWidth<760||innerHeight<480){hidePreview();return;}
  if(summary===previewTarget){previewPoint=point;positionPreview();return;}
  hidePreview();previewTarget=summary;previewPoint=point;
  const show=()=>{
    previewTimer=0;
    if(!active||previewTarget!==summary||!summary.isConnected)return;
    const entry=races.find(entry=>entry.id===summary.parentElement.dataset.raceId);
    if(!entry)return;
    preview.append(el('strong','archive-preview-title',raceName(entry)),createRaceGallery(entry,{preview:true}));
    preview.hidden=false;positionPreview();
  };
  if(keyboard)show();else previewTimer=setTimeout(show,120);
}
scope.addEventListener('pointermove',event=>{
  if(event.pointerType!=='mouse'||!fine.matches)return;
  queuePreview(event.target.closest('.archive-race-summary'),[event.clientX,event.clientY]);
},{passive:true});
scope.addEventListener('pointerleave',hidePreview);
scope.addEventListener('focusin',event=>{
  if(!event.target.matches('.archive-race-summary'))return;
  const rect=event.target.getBoundingClientRect();queuePreview(event.target,[rect.left+rect.width/2,rect.bottom],true);
});
scope.addEventListener('focusout',hidePreview);
scope.addEventListener('click',hidePreview);
scope.addEventListener('keydown',event=>{if(event.key==='Escape')hidePreview();});
window.addEventListener('scroll',hidePreview,{passive:true});window.addEventListener('resize',hidePreview);window.addEventListener('blur',hidePreview);
document.addEventListener('visibilitychange',()=>{if(document.hidden)hidePreview();});
fine.addEventListener('change',hidePreview);
scope.addEventListener('toggle',event=>{
  const record=event.target;
  if(!record.matches('.archive-race')||!scope.contains(record))return;
  record.open?expanded.add(record.dataset.raceId):expanded.delete(record.dataset.raceId);
  const body=record.querySelector('.archive-race-detail');
  if(record.open&&!body.dataset.ready){renderDetails(races.find(entry=>entry.id===record.dataset.raceId),body);body.dataset.ready='true';}
  if(!record.open){clearMedia(body);body.replaceChildren();delete body.dataset.ready;}
},true);
return {show(url){route=new URL(url);active=true;refresh();if(loading&&!request)void load();},hide(){active=false;hidePreview();},refresh};
}
