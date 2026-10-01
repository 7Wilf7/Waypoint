import {copy} from './i18n.js';
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
  const metrics=entry.kind==='race'?[entry.distance!=null?entry.distance+' km':null,entry.ascent!=null?'+'+entry.ascent+' m':null,entry.result].filter(Boolean).join(' / '):words().channelLabel;
  return {title:en?entry.titleEn:entry.titleZh,category:entry.kind==='race'?words().raceRecord:words().channelLabel,lead:formatDate(entry.date)+(metrics?' · '+metrics:''),paragraphs:body?body.split(/\n\s*\n/).filter(Boolean):[],photos:entry.photos,certificates:entry.certificates,link:entry.wechatUrl?{href:entry.wechatUrl,label:words().wechatRead}:null,kind:entry.kind};
}
function formatDate(date){return new Intl.DateTimeFormat(root.dataset.language==='en'?'en-GB':'zh-CN',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'}).format(new Date(date+'T00:00:00Z'));}
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
export function renderJournal(){renderKind('race',document.querySelector('.race-entries'));renderKind('article',document.querySelector('.article-entries'));}
export async function initJournal() {
  try {const response=await fetch('./api/entries');if(!response.ok)throw new Error('unavailable');entries=(await response.json()).entries;failed=false;}catch{failed=true;}
  renderJournal();document.dispatchEvent(new Event('journal-ready'));
  try {const response=await fetch('./api/session');if(response.ok)document.querySelector('.manage-link').hidden=!(await response.json()).owner;}catch{/* The reader remains available without a management link. */}
}

let activeApp='aevum',animation=null;
export function updateAppPreview() {
  const image=document.querySelector('.preview-screen img');
  const locale=root.dataset.language==='en'?'en':'zh';
  image.src='./assets/app-'+activeApp+'-'+locale+'.jpg';image.alt=activeApp+' · '+words().previewImage;
}
export function initAppPreview() {
  document.querySelectorAll('.preview-tab').forEach(button=>button.addEventListener('click',event=>{
    if(button.dataset.app===activeApp)return;
    animation?.cancel();activeApp=button.dataset.app;
    document.querySelectorAll('.preview-tab').forEach(item=>{const active=item===button;item.classList.toggle('is-active',active);item.setAttribute('aria-pressed',String(active));});
    const image=document.querySelector('.preview-screen img');
    if(event.detail===0||matchMedia('(prefers-reduced-motion: reduce)').matches){updateAppPreview();return;}
    const apply=()=>{
      if(activeApp!==button.dataset.app)return;
      updateAppPreview();animation=image.animate([{opacity:.2,transform:'translateY(10px) scale(.98)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:280,easing:'cubic-bezier(0.23, 1, 0.32, 1)'});
    };
    animation=image.animate([{opacity:1},{opacity:.2}],{duration:100,easing:'ease'});animation.finished.then(apply,()=>{});
  }));
  updateAppPreview();
}
