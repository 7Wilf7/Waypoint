import {copy} from './i18n.js';
import {previewProducts,previewScreens} from './preview-screens.js';
import {createPreviewSelection} from './preview-controller.js';

const root=document.documentElement;
const frame=document.querySelector('.preview-screen');
const display=document.querySelector('.preview-display');
const page=document.querySelector('.preview-page');
const message=document.querySelector('.preview-message');
const caption=document.querySelector('.preview-caption');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const views=Object.fromEntries(Object.entries(previewProducts).map(([id,product])=>[id,product.defaultView]));
const groupViews=new Map();
const images=new Map();
const pending=new Map();
let activeApp='aevum',activeView='overview',selection=null,animation=null;
const locale=()=>root.dataset.language==='en'?'en':'zh';
const words=()=>copy[locale()];
const key=state=>state.app+'/'+state.view+'/'+state.locale;
const label=state=>previewProducts[state.app].name+' · '+copy[state.locale][previewProducts[state.app].views[state.view]];

function loadScreen(state) {
  const id=key(state);
  if(images.has(id))return images.get(id);
  if(pending.has(id))return pending.get(id);
  const image=new Image(412,906);
  image.className='preview-image';image.draggable=false;
  image.src=previewScreens[id].src;
  const request=image.decode().then(()=>{images.set(id,image);pending.delete(id);return image;},error=>{pending.delete(id);throw error;});
  pending.set(id,request);
  return request;
}
function warmApp(app,allViews=false) {
  const targets=allViews?Object.keys(previewProducts[app].views):[previewProducts[app].defaultView];
  for(const view of targets)Promise.resolve(loadScreen({app,view,locale:locale()})).catch(()=>{});
}
function choose(app,view,animate=false,focusLabel=null) {
  activeApp=app;activeView=view;
  if(view!=='settings')views[app]=view;
  selection.select({app,view,locale:locale()},{animate,focusLabel});
}
function onSelect(state) {
  animation?.cancel();animation=null;
  for(const spot of previewScreens[key(state)].hotspots)if(spot.views?.includes(state.view))groupViews.set(state.app+'/'+spot.view,state.view);
  frame.dataset.app=state.app;display.dataset.view=state.view;display.dataset.locale=state.locale;
  display.setAttribute('aria-busy','true');
  // Never show the previous product beneath the newly selected button.
  page.hidden=true;message.hidden=false;
  message.textContent=words().previewLoading;
  caption.textContent=label(state);
  document.querySelectorAll('.preview-tab').forEach(button=>{
    const active=button.dataset.app===state.app;
    button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active));
  });
}
function onReady(image,state,{animate,focusLabel}) {
  image.alt=label(state)+' · '+words().previewImage;
  const buttons=previewScreens[key(state)].hotspots.map(spot=>{
    const button=document.createElement('button');
    button.type='button';button.className='preview-hotspot';
    button.setAttribute('aria-label',words()[spot.label]);
    const targetApp=spot.app||state.app;
    const active=targetApp===state.app&&(spot.app?state.view!=='settings':spot.views?spot.views.includes(state.view):spot.view===state.view);
    button.setAttribute('aria-pressed',String(active));
    const [left,top,width,height]=spot.bounds;
    Object.assign(button.style,{left:left+'%',top:top+'%',width:width+'%',height:height+'%'});
    const targetView=()=>spot.app?views[targetApp]:spot.views?groupViews.get(targetApp+'/'+spot.view)||spot.view:spot.view;
    button.addEventListener('click',event=>{if(!active)choose(targetApp,targetView(),event.detail!==0,event.detail===0?spot.label:null);});
    button.addEventListener('pointerenter',()=>Promise.resolve(loadScreen({...state,app:targetApp,view:targetView()})).catch(()=>{}));
    return button;
  });
  page.replaceChildren(image,...buttons);
  page.hidden=false;message.hidden=true;
  display.setAttribute('aria-busy','false');
  if(focusLabel)buttons.find(button=>button.getAttribute('aria-label')===words()[focusLabel])?.focus({preventScroll:true});
  if(animate&&!reduced.matches&&root.dataset.input!=='keyboard') {
    animation=page.animate([{opacity:.45,transform:'translateY(6px) scale(.99)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:180,easing:'cubic-bezier(0.23, 1, 0.32, 1)'});
  }
  warmApp(state.app,true);
}
function onError(error,state) {
  display.setAttribute('aria-busy','false');
  message.replaceChildren(document.createTextNode(words().previewFailed));
  const retry=document.createElement('button');retry.className='preview-retry';retry.type='button';retry.textContent=words().retry;
  retry.addEventListener('click',()=>choose(state.app,state.view));message.append(retry);
}
export function updateAppPreview() {
  if(selection)choose(activeApp,activeView);
}
export function initAppPreview() {
  selection=createPreviewSelection({load:loadScreen,onSelect,onReady,onError});
  document.querySelectorAll('.preview-tab').forEach(button=>{
    // The right-hand product entries always open each App's starting page.
    button.addEventListener('click',event=>choose(button.dataset.app,previewProducts[button.dataset.app].defaultView,event.detail!==0));
    button.addEventListener('pointerenter',()=>warmApp(button.dataset.app));
    button.addEventListener('focus',()=>warmApp(button.dataset.app));
  });
  reduced.addEventListener('change',()=>{if(reduced.matches){animation?.cancel();animation=null;}});
  document.addEventListener('keydown',()=>{animation?.cancel();animation=null;});
  const nearby=new IntersectionObserver(entries=>{
    if(entries.some(entry=>entry.isIntersecting)){Object.keys(previewProducts).forEach(app=>warmApp(app));nearby.disconnect();}
  },{rootMargin:'300px'});
  nearby.observe(frame);
  updateAppPreview();
}
