import {copy} from './i18n.js';
import {raceCategories,raceCategoryKeys,subtypeLabel,formatResult,sortRaces,representativeRace,raceCounts} from './race-utils.js';
import {articleReading,articleParagraphs} from './article-layout.js';
import {articleStats,sortArticles} from './article-utils.js';
import {racePhotoRoles} from './race-photos.js';
import {requestJSON,renderLoading,clearLoading,createMediaImage,clearMedia} from './loading.js';
const root=document.documentElement;
const words=()=>copy[root.dataset.language==='en'?'en':'zh'];
let entries=[];
let failed=false;
let loading=true,request=null,errorKey='unavailable';
let requested=false;
let articlesExpanded=false;
const el=(tag,className,text)=>{const element=document.createElement(tag);if(className)element.className=className;if(text)element.textContent=text;return element;};
export function journalState(){return loading?'loading':failed?'error':'ready';}
export function getEntry(id) {
  const entry=entries.find(item=>item.id===id);
  if(!entry)return null;
  const en=root.dataset.language==='en';
  const locale=en?'en':'zh';
  const body=en?entry.bodyEn:entry.bodyZh;
  const metrics=entry.kind==='race'?[subtypeLabel(entry,en?'en':'zh'),entry.distance!=null?entry.distance+' km':null,entry.ascent!=null?'+'+entry.ascent+' m':null,formatResult(entry.result)||words().raceResultMissing].filter(Boolean).join(' / '):words().channelLabel;
  const reading=entry.kind==='article'?articleReading(entry,locale):{paragraphs:articleParagraphs(body),photos:entry.photos};
  const stats=entry.kind==='article'?articleStats(body,locale):null;
  const readingMeta=stats?words().articleStats.replace('{count}',new Intl.NumberFormat(locale).format(stats.count)).replace('{minutes}',stats.minutes):'';
  const summary=entry.kind==='article'?(en?entry.summaryEn:entry.summaryZh)||reading.paragraphs[0]||'':'';
  return {id:entry.id,title:en?entry.titleEn:entry.titleZh,category:entry.kind==='race'?words()[raceCategoryKeys[entry.category]]||words().raceRecord:words().channelLabel,lead:formatDate(entry.date)+(entry.kind==='article'&&entry.publishedTime?' '+entry.publishedTime:'')+(metrics?' · '+metrics:''),...reading,summary,readingMeta,primaryPhoto:entry.kind==='race'?racePhotoRoles(entry).primary:'',certificates:entry.kind==='race'?entry.certificates:[],link:entry.wechatUrl?{href:entry.wechatUrl,label:words().wechatRead}:null,kind:entry.kind};
}
function formatDate(date){return new Intl.DateTimeFormat(root.dataset.language==='en'?'en-GB':'zh-CN',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'}).format(new Date(date+'T00:00:00Z'));}
function renderRaces(container) {
  clearMedia(container);
  if(loading){renderLoading(container,'racesLoading');if(!requested)clearLoading(container);return;}
  clearLoading(container);
  container.replaceChildren();
  const races=sortRaces(entries);
  if(failed||!races.length){renderEmpty('race',container);return;}
  const w=words(),locale=root.dataset.language==='en'?'en':'zh',counts=raceCounts(races),formats=raceCategories.filter(category=>counts[category]);
  const overview=el('div','race-overview');
  const span=races.at(-1).date.slice(0,4)+'—'+races[0].date.slice(0,4);
  for(const [value,label]of [[races.length,w.raceRecorded],[formats.length,w.raceFormats],[span,w.raceYears]]){const item=el('div','race-overview-stat');item.append(el('strong','',String(value)),el('span','',label));overview.append(item);}
  container.append(overview);
  const selected=representativeRace(races,counts.Trail?'Trail':races[0].category).entry;
  const feature=el('a','race-card race-spotlight');feature.href='#entry/'+selected.id;
  const primary=racePhotoRoles(selected).primary;
  if(primary){const image=createMediaImage('./media/'+primary,getEntry(selected.id).title,{size:'preview',originalLink:false,entry:selected.id});image.classList.add('race-spotlight-photo');feature.append(image);}
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
function renderEmpty(kind,container) {
  container.replaceChildren();
  container.append(el('p','journal-empty',failed?words()[errorKey]:kind==='race'?words().raceEmpty:words().channelEmpty));
  if(failed){const retry=el('button','button button-quiet',words().retry);retry.addEventListener('click',event=>initJournal(event.detail===0?container:null));container.append(retry);}
}
function renderArticles(container) {
  if(loading){renderLoading(container,'articlesLoading');if(!requested)clearLoading(container);return;}
  clearLoading(container);
  container.replaceChildren();
  const articles=sortArticles(entries);
  if(failed||!articles.length){renderEmpty('article',container);return;}
  const list=el('div','article-list');list.id='published-articles';
  for(const entry of articles.slice(0,articlesExpanded?articles.length:3)) {
    const display=getEntry(entry.id),card=el('a','journal-card article-card');card.href='#entry/'+entry.id;
    const date=el('time','article-date',formatDate(entry.date));date.dateTime=entry.date+(entry.publishedTime?'T'+entry.publishedTime+':00+08:00':'');
    const content=el('div','article-copy');content.append(el('h3','',display.title),el('p','article-card-excerpt',display.summary),el('span','article-reading-meta',display.readingMeta));
    card.append(date,content,el('span','journal-card-cta',words().readThought+' ↗'));list.append(card);
  }
  container.append(list);
  if(articles.length>3) {
    const more=el('button','button button-quiet article-more',articlesExpanded?words().articleLess:words().articleMore.replace('{count}',articles.length-3));
    more.type='button';more.setAttribute('aria-expanded',String(articlesExpanded));more.setAttribute('aria-controls',list.id);
    more.addEventListener('click',event=>{
      articlesExpanded=!articlesExpanded;renderArticles(container);
      const target=articlesExpanded&&event.detail===0?container.querySelector('.article-card:nth-child(4)'):container.querySelector('.article-more');
      target.focus({preventScroll:!articlesExpanded});
    });container.append(more);
  }
}
export function renderJournal(){renderRaces(document.querySelector('.race-entries'));renderArticles(document.querySelector('.article-entries'));}
export function initJournal(focusContainer=null) {
  if(request)return request;
  requested=true;loading=true;failed=false;renderJournal();document.dispatchEvent(new Event('journal-loading'));
  request=(async()=>{
    try {const data=await requestJSON('./api/entries');if(!Array.isArray(data.entries))throw new Error('unavailable');entries=data.entries;}
    catch(error){failed=true;errorKey=error.message==='request_timeout'?'loadTimedOut':'unavailable';}
    finally {
      loading=false;request=null;renderJournal();document.dispatchEvent(new Event('journal-ready'));
      if(focusContainer)focusContainer.querySelector('a,button')?.focus({preventScroll:true});
    }
  })();
  return request;
}

// Keep every list read fresh, but only request it when published content is needed.
export function initJournalOnDemand(hasStaticNote=()=>false) {
  let started=false;
  const start=()=>{
    if(started)return;
    started=true;observer.disconnect();window.removeEventListener('hashchange',route);
    initJournal();
  };
  const route=()=>{
    const legacy=location.hash.match(/^#read\/([a-z0-9-]+)$/i);
    if(/^#(?:entry\/|trails$|races$|writing$)/i.test(location.hash)||(legacy&&!hasStaticNote(legacy[1])))start();
  };
  const observer=new IntersectionObserver(items=>{if(items.some(item=>item.isIntersecting))start();},{rootMargin:'400px'});
  for(const container of document.querySelectorAll('.race-entries,.article-entries'))observer.observe(container);
  window.addEventListener('hashchange',route);
  route();
  // Owner discovery is independent of reading and runs once, including list retries.
  requestJSON('./api/session').then(session=>{document.querySelector('.manage-link').hidden=!session.owner;}).catch(()=>{/* The reader remains available without a management link. */});
}
