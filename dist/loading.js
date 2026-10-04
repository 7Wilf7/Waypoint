import {copy} from './i18n.js';
import {loadMediaImage,mediaURL} from './media-images.js';

const timers=new WeakMap();
const words=()=>copy[document.documentElement.dataset.language==='en'?'en':'zh'];

// Bound both the request and its response body. Writes are never retried here.
export async function requestJSON(url,options={},timeoutMs=20000) {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try {
    const signal=options.signal?AbortSignal.any([options.signal,controller.signal]):controller.signal;
    const response=await fetch(url,{...options,signal});
    let data;
    try {data=await response.json();}catch(error){if(controller.signal.aborted)throw error;throw new Error('unavailable');}
    if(!response.ok)throw new Error(data.error||'unavailable');
    return data;
  } catch(error) {
    if(controller.signal.aborted)throw new Error('request_timeout');
    throw error;
  } finally {clearTimeout(timer);}
}

export function clearLoading(container) {
  clearTimeout(timers.get(container));timers.delete(container);
  container.setAttribute('aria-busy','false');
}

export function renderLoading(container,labelKey,{rows=3}={}) {
  let state=container.querySelector(':scope > .loading-state');
  if(!state) {
    clearLoading(container);
    state=document.createElement('div');state.className='loading-state';state.setAttribute('role','status');
    const label=document.createElement('p');label.className='loading-copy';label.dataset.i18n=labelKey;
    const progress=document.createElement('div');progress.className='loading-progress';progress.setAttribute('role','progressbar');
    const detail=document.createElement('p');detail.className='loading-detail';detail.dataset.i18n='loadingHint';
    state.append(label,progress,detail);
    if(rows) {
      const skeleton=document.createElement('div');skeleton.className='loading-rows';skeleton.setAttribute('aria-hidden','true');
      for(let i=0;i<rows;i++) {
        const row=document.createElement('div');row.className='loading-row';
        for(const name of ['loading-date','loading-title','loading-meta']){const line=document.createElement('span');line.className=name;row.append(line);}
        skeleton.append(row);
      }
      state.append(skeleton);
    }
    container.replaceChildren(state);
  }
  if(!timers.has(container)) {
    state.querySelector('.loading-detail').dataset.i18n='loadingHint';
    timers.set(container,setTimeout(()=>{const detail=state.querySelector('.loading-detail');detail.dataset.i18n='loadingSlow';detail.textContent=words().loadingSlow;},5000));
  }
  container.setAttribute('aria-busy','true');
  state.querySelector('.loading-copy').dataset.i18n=labelKey;
  state.querySelector('.loading-progress').setAttribute('aria-label',words()[labelKey]);
  state.querySelectorAll('[data-i18n]').forEach(node=>node.textContent=words()[node.dataset.i18n]);
}

const mediaCleanup=new WeakMap();
export function clearMedia(container) {
  container.querySelectorAll('.media-frame').forEach(frame=>mediaCleanup.get(frame)?.());
}

// Decode before showing the photo, then let its natural proportions set the frame.
export function createMediaImage(src,alt,{size='read',entry,originalLink=true}={}) {
  const frame=document.createElement('div');frame.className='media-frame';
  let revision=0,timer,disposed=false;
  const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){observer.disconnect();load();}},{rootMargin:'240px'});
  function load(keyboard=false) {
    if(disposed)return;
    const ticket=++revision;clearTimeout(timer);frame.classList.remove('is-ready');renderLoading(frame,'imageLoading',{rows:0});
    const failed=()=>{
      if(disposed||revision!==ticket)return;
      revision++;clearTimeout(timer);clearLoading(frame);
      const error=document.createElement('div');error.className='load-error';error.setAttribute('role','status');
      const text=document.createElement('p');text.textContent=words().imageFailed;
      const retry=document.createElement('button');retry.className='button button-quiet';retry.type='button';retry.textContent=words().retry;
      retry.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();load(event.detail===0);});error.append(text,retry);frame.replaceChildren(error);
      if(keyboard)retry.focus({preventScroll:true});
    };
    timer=setTimeout(failed,20000);
    loadMediaImage(src,{size,entry}).then(image=>{
      if(disposed||revision!==ticket)return;
      clearTimeout(timer);clearLoading(frame);image.className='media-image';image.alt=alt;
      frame.style.setProperty('--media-width',image.naturalWidth+'px');frame.classList.add('is-ready');
      if(originalLink) {
        const link=document.createElement('a');link.className='media-photo-link';link.href=mediaURL(src,entry);link.target='_blank';link.rel='noopener';
        link.setAttribute('aria-label',words().viewOriginal+' · '+alt);
        const label=document.createElement('span');label.className='media-original-label';label.textContent=words().viewOriginal+' ↗';
        link.append(image,label);frame.replaceChildren(link);
      }else frame.replaceChildren(image);
      if(keyboard){frame.tabIndex=-1;frame.focus({preventScroll:true});}
    },failed);
  }
  renderLoading(frame,'imageLoading',{rows:0});
  clearLoading(frame);
  observer.observe(frame);
  mediaCleanup.set(frame,()=>{disposed=true;revision++;observer.disconnect();clearTimeout(timer);clearLoading(frame);});
  return frame;
}
