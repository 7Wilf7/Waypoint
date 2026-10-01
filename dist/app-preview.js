import {copy} from './i18n.js';
import {previewProducts,previewScreens} from './preview-screens.js';
import {createPreviewSelection} from './preview-controller.js';

const root=document.documentElement;
const frame=document.querySelector('.preview-screen');
const display=document.querySelector('.preview-display');
const page=document.querySelector('.preview-page');
const message=document.querySelector('.preview-message');
const caption=document.querySelector('.preview-caption');
const productNav=document.querySelector('.preview-product-nav');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const views=Object.fromEntries(Object.entries(previewProducts).map(([id,product])=>[id,product.defaultView]));
const groupViews=new Map();
const images=new Map();
const pending=new Map();
let activeApp='aevum',selection=null,animation=null;
const locale=()=>root.dataset.language==='en'?'en':'zh';
const words=()=>copy[locale()];
const key=state=>state.app+'/'+state.view+'/'+state.locale;
const label=state=>previewProducts[state.app].name+' · '+copy[state.locale][previewProducts[state.app].views[state.view]];

function loadScreen(state) {
  const id=key(state);
  if(images.has(id))return images.get(id);
  if(pending.has(id))return pending.get(id);
  const image=new Image(412,838);
  image.className='preview-image';image.draggable=false;
  image.src=previewScreens[id].src;
  const request=image.decode().then(()=>{images.set(id,image);pending.delete(id);return image;},error=>{pending.delete(id);throw error;});
  pending.set(id,request);
  return request;
}
function warmApp(app,allViews=false) {
  const targets=allViews?Object.keys(previewProducts[app].views):[views[app]];
  for(const view of targets)Promise.resolve(loadScreen({app,view,locale:locale()})).catch(()=>{});
}
function choose(app,view,animate=false) {
  activeApp=app;views[app]=view;
  selection.select({app,view,locale:locale()},{animate});
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
  document.querySelectorAll('.preview-tab,.preview-product-tab').forEach(button=>{
    const active=button.dataset.app===state.app;
    button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active));
  });
}
function onReady(image,state,{animate}) {
  image.alt=label(state)+' · '+words().previewImage;
  const buttons=previewScreens[key(state)].hotspots.map(spot=>{
    const button=document.createElement('button');
    button.type='button';button.className='preview-hotspot';
    button.setAttribute('aria-label',words()[spot.label]);
    const active=spot.views?spot.views.includes(state.view):spot.view===state.view;
    button.setAttribute('aria-pressed',String(active));
    const [left,top,width,height]=spot.bounds;
    Object.assign(button.style,{left:left+'%',top:top+'%',width:width+'%',height:height+'%'});
    button.addEventListener('click',event=>{if(!active)choose(state.app,spot.views?groupViews.get(state.app+'/'+spot.view)||spot.view:spot.view,event.detail!==0);});
    button.addEventListener('pointerenter',()=>Promise.resolve(loadScreen({...state,view:spot.view})).catch(()=>{}));
    return button;
  });
  page.replaceChildren(image,...buttons);
  page.hidden=false;message.hidden=true;
  display.setAttribute('aria-busy','false');
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
  productNav.setAttribute('aria-label',words().previewProducts);
  if(selection)choose(activeApp,views[activeApp]);
}
export function initAppPreview() {
  selection=createPreviewSelection({load:loadScreen,onSelect,onReady,onError});
  for(const [app,product] of Object.entries(previewProducts)) {
    const button=document.createElement('button');button.type='button';button.className='preview-product-tab';button.dataset.app=app;
    const icon=document.createElement('img');icon.src='./assets/'+app+'.png';icon.alt='';
    const name=document.createElement('span');name.textContent=product.name;
    button.append(icon,name);productNav.append(button);
  }
  document.querySelectorAll('.preview-tab,.preview-product-tab').forEach(button=>{
    button.addEventListener('click',event=>{if(button.dataset.app!==activeApp)choose(button.dataset.app,views[button.dataset.app],event.detail!==0);});
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
