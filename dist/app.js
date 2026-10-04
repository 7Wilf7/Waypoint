import { notesByLanguage } from './content.js';
import { copy } from './i18n.js';
import { initMotion } from './motion.js';
import { initJournal, getEntry, renderJournal, journalState } from './journal.js';
import { initAppPreview, updateAppPreview } from './app-preview.js';
import { initHeroGallery } from './hero-gallery.js';
import { initAmbientMotion } from './ambient-motion.js';
import { initAmbientAudio } from './ambient-audio.js';
import { initTheme } from './theme.js';
import {renderLoading,clearLoading,createMediaImage,clearMedia} from './loading.js';
import {mediaURL} from './media-images.js';

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
const readingDestination = key => ['aevum','memory'].includes(key) ? '#making' : ['about','waypoint'].includes(key) ? '#about' : getEntry(key)?.kind === 'race' ? '#races' : '#writing';

const language = () => root.dataset.language === 'en' ? 'en' : 'zh';
const words = () => copy[language()];
const notes = () => notesByLanguage[language()];

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
  document.querySelector('meta[name="description"]').content = text.description;
  document.title = text.pageTitle;
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
  updateAppPreview();
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

function applyRoute() {
  const match = location.hash.match(/^#(read|entry)\/([a-z0-9-]+)$/i);
  if (match && (notes()[match[2]] || getEntry(match[2]))) {
    if (!dialog.open && !history.state?.reading) returnHash = readingDestination(match[2]);
    renderNote(match[2]);
  } else if(match&&match[1]==='entry') {
    if(!dialog.open)returnHash=match[2].startsWith('race-')?'#races':'#writing';
    renderPendingNote(match[2]);
  } else if (dialog.open) {
    routing = true;
    dialog.close();
    routing = false;
  }
}

document.addEventListener('click', event => {
  const link = event.target.closest('a[href^="#read/"],a[href^="#entry/"]');
  if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
  const key = link.getAttribute('href').split('/')[1];
  if (!notes()[key] && !getEntry(key)) return;
  event.preventDefault();
  readerOrigin = link;
  if (!dialog.open) returnHash = /^#(read|entry)\//.test(location.hash) ? readingDestination(key) : location.hash;
  history.pushState({ reading: true }, '', (notes()[key] ? '#read/' : '#entry/') + key);
  renderNote(key, event.detail === 0);
});
document.querySelector('.reader-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
dialog.addEventListener('close', () => {
  const fallbackHash = readingDestination(readingKey);
  const readHash = '#' + (notes()[readingKey] ? 'read/' : 'entry/') + readingKey;
  clearLoading(readerBody);clearMedia(readerBody);
  root.classList.remove('reading');
  document.title = words().pageTitle;
  readingKey = null;
  if (!routing && /^#(read|entry)\//.test(location.hash)) history.replaceState(null, '', location.pathname + location.search + returnHash);
  document.dispatchEvent(new Event('waypoint-reader'));
  requestAnimationFrame(() => {
    if(dialog.open)return;
    const active=document.activeElement;
    if(active!==document.body&&!dialog.contains(active)&&active?.getClientRects().length)return;
    const currentOrigin = readerOrigin?.isConnected && readerOrigin.getAttribute('href') === readHash
      ? readerOrigin : document.querySelector('a[href="' + readHash + '"]');
    if(currentOrigin?.getClientRects().length)currentOrigin.focus({preventScroll:true});
    else {
      const anchor = /^#[a-z][\w-]*$/i.test(returnHash) ? returnHash : fallbackHash;
      const section=document.querySelector(anchor);
      const heading=section?.querySelector('h2')||document.querySelector('#trails-heading');
      if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}
    }
  });
});
window.addEventListener('popstate', applyRoute);
window.addEventListener('hashchange', applyRoute);
document.addEventListener('journal-ready',applyRoute);
document.addEventListener('journal-loading',applyRoute);
applyRoute();

const navLinks = [...document.querySelectorAll('.site-nav a')];
const indicator = document.createElement('span');
indicator.className = 'nav-indicator';
indicator.setAttribute('aria-hidden', 'true');
document.querySelector('.site-nav').prepend(indicator);
const navSections=navLinks.map(link=>document.querySelector(link.getAttribute('href')));
let navFrame=0;
function updateNavigation() {
  navFrame=0;
  if(readingKey)return;
  const readingLine=document.querySelector('.site-header').getBoundingClientRect().bottom+Math.min(innerHeight*.12,80);
  const active=navSections.filter(section=>section.getBoundingClientRect().top<=readingLine).at(-1);
  indicator.classList.toggle('is-visible',Boolean(active));
  navLinks.forEach((link, index) => {
    if (active&&link.getAttribute('href') === '#' + active.id) {
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
initJournal();
initAppPreview();
initMotion();
initHeroGallery();
initAmbientMotion();
initAmbientAudio();
import('./elastic-details.js').then(module => module.initElasticDetails()).catch(() => {});
