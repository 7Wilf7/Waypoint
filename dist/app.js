import { notesByLanguage } from './content.js';
import { copy } from './i18n.js';
import { initMotion } from './motion.js';
import { initJournal, initJournalOnDemand, getEntry, renderJournal, journalState } from './journal.js';
import { initAppPreview, updateAppPreview } from './app-preview.js';
import { initHeroGallery } from './hero-gallery.js';
import { initAmbientMotion } from './ambient-motion.js';
import { initAmbientAudio } from './ambient-audio.js';
import { initTheme } from './theme.js';
import {renderLoading,clearLoading,createMediaImage,clearMedia} from './loading.js';
import {mediaURL} from './media-images.js';
import {initRaceArchive} from './race-archive.js';
import {initTouchMotion} from './touch-motion.js';

const root = document.documentElement;
const theme = initTheme();
const languageButtons = [...document.querySelectorAll('.language-toggle')];
const announcement = document.querySelector('.theme-announcement');
const dialog = document.querySelector('.reader-dialog');
const readerTitle = document.querySelector('#reader-title');
const readerBody = document.querySelector('#reader-body');
let returnHash = '#trails';
let readingKey = null;
let routing = false;
let readerOrigin = null;
let homeInitialized=false,activeView=null,routeSequence=0,historySequence=0,routeURL=null,restoredHref=null;
const homeView=document.querySelector('#home-view'),archiveView=document.querySelector('#race-archive-view');
const routeOrigins=new Map();
const readingDestination = key => ['aevum','memory'].includes(key) ? '#making' : ['about','waypoint'].includes(key) ? '#about' : getEntry(key)?.kind === 'race' ? '#races' : '#writing';

const language = () => root.dataset.language === 'en' ? 'en' : 'zh';
const words = () => copy[language()];
const notes = () => notesByLanguage[language()];
const archive=initRaceArchive(archiveView,{navigate,locale:language});
const pageTitle=()=>root.dataset.view==='races'?words().raceArchiveDocumentTitle:words().pageTitle;

function applyLanguage(next, announce = false) {
  root.dataset.language = next === 'en' ? 'en' : 'zh';
  root.lang = language() === 'en' ? 'en' : 'zh-CN';
  const text = words();
  document.querySelectorAll('[data-i18n]').forEach(element => {
    // Markup comes only from our authored translation dictionary.
    element.innerHTML = text[element.dataset.i18n];
  });
  document.querySelectorAll('[data-i18n-aria]').forEach(element => element.setAttribute('aria-label', text[element.dataset.i18nAria]));
  document.querySelectorAll('[data-i18n-alt]').forEach(element => element.alt = text[element.dataset.i18nAlt]);
  document.querySelectorAll('[data-i18n-roledescription]').forEach(element => element.setAttribute('aria-roledescription', text[element.dataset.i18nRoledescription]));
  document.querySelector('meta[name="description"]').content = root.dataset.view === 'races' ? text.raceArchiveIntro : text.description;
  document.title = pageTitle();
  languageButtons.forEach(button => {
    button.textContent = language() === 'en' ? '中' : 'EN';
    button.lang = language() === 'en' ? 'zh-CN' : 'en';
    button.setAttribute('aria-label', text.languageLabel);
    button.title = text.languageLabel;
  });
  theme.sync();
  if (readingKey && dialog.open&&!renderNote(readingKey, dialog.dataset.input === 'keyboard', true))renderPendingNote(readingKey);
  if (announce) announcement.textContent = text.languageChanged;
  else announcement.textContent = '';
  document.querySelector('.note-preview').classList.remove('is-visible');
  renderJournal();
  if(homeInitialized)updateAppPreview();
  archive.refresh();
}

applyLanguage(language());
languageButtons.forEach(button => button.addEventListener('click', event => {
  if (event.detail === 0) root.dataset.input = 'keyboard';
  const next = language() === 'zh' ? 'en' : 'zh';
  try { localStorage.setItem('waypoint-language', next); } catch { /* Optional preference. */ }
  applyLanguage(next, true);
}));
window.addEventListener('storage', event => {
  if (event.key === 'waypoint-language' && ['zh', 'en'].includes(event.newValue)) applyLanguage(event.newValue);
});

function renderNote(key, keyboard = false, preservePosition = false) {
  const note = notes()[key] || getEntry(key);
  if (!note) return false;
  const position = dialog.scrollTop;
  document.querySelector('.reader-brand').textContent=note.kind==='race'?'Waypoint / '+words().races:words().readerBrand;
  readerTitle.textContent = note.title;
  document.querySelector('#reader-category').textContent = note.category;
  document.querySelector('#reader-lead').textContent = note.lead;
  clearLoading(readerBody);clearMedia(readerBody);readerBody.replaceChildren();
  if(note.kind==='article') {
    const overview=document.createElement('aside');overview.className='reader-overview';
    const label=document.createElement('span');label.className='eyebrow';label.textContent=words().articleOverview;
    const summary=document.createElement('p');summary.textContent=note.summary;
    const stats=document.createElement('span');stats.className='article-reading-meta';stats.textContent=note.readingMeta;
    overview.append(label,summary,stats);readerBody.append(overview);
  }
  for (const block of note.blocks || note.paragraphs.map(text=>({type:'paragraph',text}))) {
    if(block.type==='image') {
      const figure=document.createElement('figure');figure.className='reader-inline-photo';
      const image=createMediaImage('./media/'+block.mediaId,note.title+' · '+words().galleryPhoto,{entry:note.id});
      figure.append(image);readerBody.append(figure);
    }else {
      const paragraph = document.createElement(block.type==='heading'?'h3':'p');
      paragraph.textContent = block.text;
      readerBody.append(paragraph);
    }
  }
  if (note.products) {
    const products = document.createElement('div');
    products.className = 'reader-products';
    for (const product of note.products) {
      const item = document.createElement('div');
      const image = document.createElement('img');
      image.src = product.image;
      image.alt = '';
      image.width = 48;
      image.height = 48;
      const name = document.createElement('strong');
      name.textContent = product.name;
      const label = document.createElement('span');
      label.textContent = product.label;
      item.append(image, name, label);
      products.append(item);
    }
    readerBody.append(products);
  }
  if (note.link) {
    const link = document.createElement('a');
    link.href = note.link.href;
    link.className = 'button button-primary reader-project-link';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = note.link.label;
    readerBody.append(link);
  }
  if (note.photos?.length) {
    const gallery=document.createElement('div');gallery.className='reader-gallery';
    for (const [index,id] of note.photos.entries())gallery.append(createMediaImage('./media/'+id,note.title+' · '+words().galleryPhoto+' '+(index+1),{entry:note.id}));
    readerBody.append(gallery);
  }
  if (note.certificates?.length) {
    const section=document.createElement('div');section.className='reader-certificates';
    const title=document.createElement('h3');title.textContent=words().raceCertificates;section.append(title);
    for (const [index,id] of note.certificates.entries()) {const link=document.createElement('a');link.href=mediaURL('./media/'+id,note.id);link.target='_blank';link.rel='noopener';link.className='button button-quiet';link.textContent=words().viewMedia+' '+(index+1);section.append(link);}
    readerBody.append(section);
  }
  readingKey = key;
  document.title = note.title + ' — Waypoint';
  if (!dialog.open) {
    dialog.dataset.input = keyboard ? 'keyboard' : 'pointer';
    root.classList.add('reading');
    document.querySelector('.note-preview').classList.remove('is-visible');
    dialog.showModal();
    document.dispatchEvent(new Event('waypoint-reader'));
  }
  dialog.scrollTop = preservePosition ? position : 0;
  return true;
}

function renderPendingNote(key) {
  readingKey=key;readerTitle.textContent=words().recordLoading;document.title=words().recordLoading+' — Waypoint';
  document.querySelector('#reader-category').textContent='Waypoint';document.querySelector('#reader-lead').textContent='';
  clearMedia(readerBody);
  if(journalState()==='loading')renderLoading(readerBody,'recordLoading',{rows:0});
  else {
    clearLoading(readerBody);readerBody.replaceChildren();
    const error=document.createElement('div');error.className='load-error';error.setAttribute('role','status');
    const text=document.createElement('p');text.textContent=journalState()==='error'?words().unavailable:words().recordNotFound;
    error.append(text);
    if(journalState()==='error') {
      const retry=document.createElement('button');retry.type='button';retry.className='button button-quiet';retry.textContent=words().retry;
      retry.addEventListener('click',()=>initJournal().then(()=>dialog.open&&dialog.querySelector('.reader-close').focus({preventScroll:true})));error.append(retry);
    }
    readerBody.append(error);
  }
  if(!dialog.open){root.classList.add('reading');dialog.showModal();document.dispatchEvent(new Event('waypoint-reader'));}
}

function ensureHome() {
  if(homeInitialized)return;
  homeInitialized=true;
  initJournalOnDemand(key=>Boolean(notes()[key]));
  initAppPreview();initMotion();initHeroGallery();
}
function savePosition(origin) {
  const state={...history.state,waypointKey:history.state?.waypointKey||'initial',waypointScroll:[scrollX,scrollY]};
  history.replaceState(state,'',location.href);
  if(origin)routeOrigins.set(state.waypointKey,origin);
}
function navigate(target,{keyboard=false,origin=null,preserveScroll=false}={}) {
  const url=new URL(target,location.href);
  if(url.origin!==location.origin||!['/','/races'].includes(url.pathname))return;
  savePosition(origin);
  const reading=/^#(?:read|entry)\//.test(url.hash)&&url.pathname==='/';
  if(reading){readerOrigin=origin;returnHash=/^#(?:read|entry)\//.test(location.hash)?readingDestination(url.hash.split('/')[1]):location.hash||'#trails';}
  history.pushState({waypointKey:'route-'+(++historySequence),waypointScroll:preserveScroll?[scrollX,scrollY]:[0,0],reading},'',url.pathname+url.search+url.hash);
  applyRoute({position:preserveScroll?'preserve':'navigate',keyboard,origin});
}
function applyRoute({position='preserve',keyboard=false,origin=null}={}) {
  const url=new URL(location.href),nextView=url.pathname==='/races'?'races':'home';
  const ticket=routeURL!==url.href||position!=='preserve'?++routeSequence:routeSequence;
  routeURL=url.href;
  const changed=nextView!==activeView;
  activeView=nextView;root.dataset.view=nextView;
  homeView.hidden=nextView!=='home';archiveView.hidden=nextView!=='races';
  document.body.classList.toggle('waypoint-home',nextView==='home');
  document.body.classList.toggle('race-archive-page',nextView==='races');
  document.querySelector('meta[name="description"]').content=nextView==='races'?words().raceArchiveIntro:words().description;
  document.title=pageTitle();
  if(nextView==='races')archive.show(url);else{archive.hide();ensureHome();}
  const match=nextView==='home'?url.hash.match(/^#(read|entry)\/([a-z0-9-]+)$/i):null;
  if(match) {
    if(!dialog.open&&!history.state?.reading)returnHash=readingDestination(match[2]);
    if(!renderNote(match[2],keyboard,readingKey===match[2]))renderPendingNote(match[2]);
    if(match[1]==='entry'&&!getEntry(match[2])&&journalState()==='loading')void initJournal();
  }else if(dialog.open){routing=true;dialog.close();routing=false;}
  scheduleNavigation();
  if(dialog.open||position==='preserve'&&!(keyboard&&origin?.matches('.race-filter')))return;
  requestAnimationFrame(()=>{
    if(ticket!==routeSequence||dialog.open)return;
    const stored=position==='restore'?history.state?.waypointScroll:null;
    const anchor=url.hash&&document.getElementById(url.hash.slice(1));
    if(stored)scrollTo({left:stored[0],top:stored[1],behavior:'instant'});
    else if(anchor&&!anchor.closest('[hidden]'))anchor.scrollIntoView({behavior:'instant'});
    else if(changed||position==='navigate')scrollTo({left:0,top:0,behavior:'instant'});
    const previous=position==='restore'?routeOrigins.get(history.state?.waypointKey):null;
    if(previous?.isConnected&&previous.getClientRects().length)previous.focus({preventScroll:true});
    else if(keyboard) {
      const focus=origin?.matches('.race-filter')?archiveView.querySelector('.race-filter[aria-pressed="true"]'):nextView==='races'?archiveView.querySelector('h1'):anchor?.querySelector('h2,h1')||anchor;
      if(focus){if(!focus.matches('a,button,input,summary'))focus.tabIndex=-1;focus.focus({preventScroll:true});}
    }
  });
}

document.addEventListener('click',event=>{
  const link=event.target.closest('a[href]');
  if(!link||event.defaultPrevented||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||event.button!==0||link.hasAttribute('download')||link.target&&link.target!=='_self')return;
  const url=new URL(link.href,location.href);
  if(url.origin!==location.origin||!['/','/races'].includes(url.pathname))return;
  // The active view's skip link keeps the browser's native anchor behavior.
  if(link.classList.contains('skip-link'))return;
  event.preventDefault();navigate(url,{keyboard:event.detail===0,origin:link});
});
document.querySelector('.reader-close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
dialog.addEventListener('close',()=>{
  const fallbackHash=readingDestination(readingKey),readHash='#'+(notes()[readingKey]?'read/':'entry/')+readingKey;
  clearLoading(readerBody);clearMedia(readerBody);root.classList.remove('reading');readingKey=null;
  document.title=pageTitle();document.dispatchEvent(new Event('waypoint-reader'));
  if(!routing&&/^#(?:read|entry)\//.test(location.hash)) {
    if(history.state?.reading){history.back();return;}
    history.replaceState({...history.state,reading:false},'',location.pathname+location.search+(returnHash||fallbackHash));
    applyRoute({position:'restore'});
  }
  requestAnimationFrame(()=>{
    if(dialog.open||root.dataset.view!=='home')return;
    const active=document.activeElement;
    if(active!==document.body&&!dialog.contains(active)&&active?.getClientRects().length)return;
    const current=readerOrigin?.isConnected&&readerOrigin.getAttribute('href')===readHash?readerOrigin:homeView.querySelector('a[href="'+readHash+'"]');
    if(current?.getClientRects().length)current.focus({preventScroll:true});
  });
});
window.addEventListener('popstate',()=>{restoredHref=location.href;applyRoute({position:'restore'});});
window.addEventListener('hashchange',()=>{const restored=restoredHref===location.href;restoredHref=null;if(!restored)applyRoute({position:'hash'});});
document.addEventListener('journal-ready',()=>applyRoute());
document.addEventListener('journal-loading',()=>applyRoute());

const navLinks = [...document.querySelectorAll('.site-nav a')];
const indicator = document.createElement('span');
indicator.className = 'nav-indicator';
indicator.setAttribute('aria-hidden', 'true');
document.querySelector('.site-nav').prepend(indicator);
const navSections=navLinks.map(link=>document.querySelector(new URL(link.href).hash));
let navFrame=0;
function updateNavigation() {
  navFrame=0;
  if(readingKey)return;
  root.style.setProperty('--race-header-bottom',Math.ceil(document.querySelector('.site-header').getBoundingClientRect().bottom)+'px');
  if(activeView==='races') {
    indicator.classList.add('is-visible');indicator.style.transform='translateX(100%)';
    navLinks.forEach(link=>new URL(link.href).hash==='#trails'?link.setAttribute('aria-current','page'):link.removeAttribute('aria-current'));
    return;
  }
  const readingLine=document.querySelector('.site-header').getBoundingClientRect().bottom+Math.min(innerHeight*.12,80);
  const active=navSections.filter(section=>section.getBoundingClientRect().top<=readingLine).at(-1);
  indicator.classList.toggle('is-visible',Boolean(active));
  navLinks.forEach((link, index) => {
    if (active&&new URL(link.href).hash === '#' + active.id) {
      link.setAttribute('aria-current', 'location');
      indicator.style.transform = 'translateX(' + (index * 100) + '%)';
    } else link.removeAttribute('aria-current');
  });
}
function scheduleNavigation(){if(!navFrame)navFrame=requestAnimationFrame(updateNavigation);}
window.addEventListener('scroll',scheduleNavigation,{passive:true});
window.addEventListener('resize',scheduleNavigation);
window.addEventListener('load',scheduleNavigation);
new ResizeObserver(scheduleNavigation).observe(document.querySelector('main'));
document.addEventListener('journal-ready',scheduleNavigation);
scheduleNavigation();
history.scrollRestoration='manual';
if(!history.state?.waypointKey)history.replaceState({...history.state,waypointKey:'initial'},'',location.href);
initAmbientMotion();initTouchMotion();initAmbientAudio();
applyRoute({position:'initial'});
import('./elastic-details.js').then(module => module.initElasticDetails()).catch(() => {});
