import {getEntry} from './journal.js';
import {copy} from './i18n.js';
import {initSurfaceMotion} from './surface-motion.js';
import {initScrollMotion} from './scroll-motion.js';
import {initPointerField} from './pointer-field.js';
import {initHeroMotion} from './hero-motion.js';
import {loadMediaImage,preloadMediaImage} from './media-images.js';

export function initMotion() {
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const wide = matchMedia('(min-width: 1101px)');
  const preview = document.querySelector('.note-preview');
  setTimeout(() => root.classList.add('intro-complete'), 1100);

  function stopDecorativeMotion() {
    preview.classList.remove('is-visible');
  }
  document.addEventListener('keydown', event => {
    if (['Tab', 'Enter', ' ', 'ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', 'Escape'].includes(event.key)) {
      root.dataset.input = 'keyboard';
      root.classList.add('intro-complete');
      stopDecorativeMotion();
    }
  });
  document.addEventListener('pointerdown', () => { root.dataset.input = 'pointer'; });
  document.addEventListener('pointermove', event => {
    if (event.pointerType === 'mouse' && root.dataset.input !== 'pointer') root.dataset.input = 'pointer';
  }, { passive: true });

  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopDecorativeMotion();});
  document.addEventListener('waypoint-reader',()=>{if(root.classList.contains('reading'))stopDecorativeMotion();});

  reduce.addEventListener('change', () => { if (reduce.matches) stopDecorativeMotion(); });
  finePointer.addEventListener('change', () => { if (!finePointer.matches) preview.classList.remove('is-visible'); });
  wide.addEventListener('change', () => { if (!wide.matches) preview.classList.remove('is-visible'); });

  // A visual preview behind the pointer. It never intercepts a click.
  const previewArt = preview.querySelector('.preview-art');
  const previewCategory = preview.querySelector('.preview-category');
  const previewTitle = preview.querySelector('.preview-title');
  const previewSummary = preview.querySelector('.preview-summary');
  const previewMeta = preview.querySelector('.preview-meta');
  const previewAssets = { trail: './assets/mountain.jpg', memory: './assets/aevum.png', waypoint: './favicon.svg' };
  let previewTarget=null,previewRevision=0,readWarmTimer=0;
  const hidePreview=()=>{previewTarget=null;previewRevision++;clearTimeout(readWarmTimer);preview.classList.remove('is-visible');};
  const warmed=new WeakSet();
  const warmObserver=new IntersectionObserver(entries=>{
    for(const item of entries)if(item.isIntersecting) {
      warmObserver.unobserve(item.target);
      const entry=getEntry(item.target.getAttribute('href').split('/')[1]);
      if(entry?.primaryPhoto)preloadMediaImage('./media/'+entry.primaryPhoto,{size:'preview',entry:entry.id}).catch(()=>{});
    }
  },{rootMargin:'900px'});
  function registerPreviewTargets() {
    if(!finePointer.matches||!wide.matches||reduce.matches)return;
    document.querySelectorAll('.race-card').forEach(row=>{if(!warmed.has(row)){warmed.add(row);warmObserver.observe(row);}});
  }
  new MutationObserver(registerPreviewTargets).observe(document.querySelector('main'),{childList:true,subtree:true});
  finePointer.addEventListener('change',registerPreviewTargets);wide.addEventListener('change',registerPreviewTargets);reduce.addEventListener('change',registerPreviewTargets);
  registerPreviewTargets();
  async function staticPreviewImage(source) {
    const image=new Image();image.decoding='async';
    const ready=new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;});image.src=source;
    await ready;if(image.decode)await image.decode();return image;
  }
  document.addEventListener('pointermove',event=>{
    const row=event.target.closest('.note-row,.article-card,.race-card');
    if(event.pointerType!=='mouse'||!row||!finePointer.matches||!wide.matches||reduce.matches||root.dataset.input==='keyboard'||root.classList.contains('reading')){hidePreview();return;}
    if(row===previewTarget&&preview.classList.contains('is-visible'))return;
    const key=row.getAttribute('href').split('/')[1],entry=row.matches('.note-row')?null:getEntry(key);
    if(!entry&&!row.matches('.note-row')){hidePreview();return;}
    const w=copy[root.dataset.language==='en'?'en':'zh'];
    const image=entry?(entry.kind==='race'&&entry.primaryPhoto?'./media/'+entry.primaryPhoto:''):previewAssets[key];
    const ticket=++previewRevision;clearTimeout(readWarmTimer);
    previewArt.hidden=!image;
    previewArt.classList.remove('is-ready');previewArt.replaceChildren();
    if(image) {
      const status=document.createElement('p');status.className='preview-image-status';status.dataset.i18n='imageLoading';status.textContent=w.imageLoading;previewArt.append(status);
      (entry?loadMediaImage(image,{size:'preview',entry:entry.id}):staticPreviewImage(image)).then(previewImage=>{
        if(previewRevision!==ticket||previewTarget!==row)return;
        previewImage.alt='';previewImage.classList.add('is-ready');previewArt.classList.add('is-ready');previewArt.replaceChildren(previewImage);
      },()=>{if(previewRevision===ticket&&previewTarget===row){status.dataset.i18n='imageFailed';status.textContent=copy[root.dataset.language==='en'?'en':'zh'].imageFailed;}});
      // Prepare the reading size only after a deliberate hover, not for every race.
      if(entry)readWarmTimer=setTimeout(()=>{if(previewTarget===row)preloadMediaImage(image,{size:'read',entry:entry.id}).catch(()=>{});},220);
    }
    preview.dataset.note=key;preview.dataset.kind=entry?.kind||'note';preview.dataset.presentation=image?'image':'text';
    previewCategory.textContent=entry?entry.kind==='article'?w.articleOverview:w.racePreview:row.querySelector('.note-category').textContent;
    previewTitle.textContent=entry?.title||'';
    previewSummary.textContent=entry?.kind==='article'?entry.summary:entry&&!image?w.racePhotoMissing:'';
    previewMeta.textContent=entry?.kind==='article'?entry.readingMeta:entry?.lead||'';
    for(const element of [previewTitle,previewSummary,previewMeta])element.hidden=!element.textContent;
    preview.style.left='0';preview.style.top='0';previewTarget=row;preview.classList.add('is-visible');
  },{passive:true});
  document.addEventListener('click',hidePreview);
  document.addEventListener('pointerleave',hidePreview);
  window.addEventListener('scroll',hidePreview,{passive:true});
  window.addEventListener('blur',hidePreview);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)hidePreview();});
  new MutationObserver(hidePreview).observe(root,{attributes:true,attributeFilter:['data-language','data-theme']});

  document.querySelectorAll('.spotlight-surface').forEach(surface => {
    surface.addEventListener('pointermove', event => {
      if (!finePointer.matches || reduce.matches) return;
      const rect = surface.getBoundingClientRect();
      surface.style.setProperty('--spotlight-x', (event.clientX - rect.left) + 'px');
      surface.style.setProperty('--spotlight-y', (event.clientY - rect.top) + 'px');
    });
  });
  initPointerFeedback();
  initSurfaceMotion();
  initScrollMotion();
  initHeroMotion();
  initPointerField();
}

function initPointerFeedback() {
  const root=document.documentElement;
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');
  const fine=matchMedia('(hover: hover) and (pointer: fine)');
  const bubble=document.querySelector('.pointer-bubble');
  const label=bubble.querySelector('span');
  const preview=document.querySelector('.note-preview');
  const selector='a[href],button:not([disabled])';
  const circleTargets='.note-row,.journal-card,.race-card,.project-card .button';
  const magnets='.button,.site-nav a,.language-toggle,.theme-toggle,.sound-toggle,.footer-link,.preview-tab';
  let active=null, magnet=null, bounds=null, frame=0, previous=0, previewShowing=false,lastPointer=null;
  const destination=[0,0,0,0], position=[0,0,0,0], velocity=[0,0,0,0];
  const allowed=()=>fine.matches&&!reduce.matches&&!document.hidden&&root.dataset.input!=='keyboard'&&!root.classList.contains('reading');
  const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
  function tick(now) {
    frame=0;
    if(!allowed()) {reset();return;}
    const dt=Math.min((now-(previous||now-16))/1000,1/60);
    previous=now;
    let moving=false;
    for(let i=0;i<4;i++) {
      velocity[i]+=((destination[i]-position[i])*100-velocity[i]*10)*dt;
      position[i]+=velocity[i]*dt;
      if(Math.abs(destination[i]-position[i])>.05||Math.abs(velocity[i])>.05)moving=true;
    }
    if(magnet)magnet.style.transform='translate3d('+position[0].toFixed(2)+'px,'+position[1].toFixed(2)+'px,0)';
    if(preview.classList.contains('is-visible')) preview.style.transform='translate3d('+position[2].toFixed(2)+'px,'+position[3].toFixed(2)+'px,0) rotate(-2deg)';
    if(moving)frame=requestAnimationFrame(tick);else previous=0;
  }
  function schedule(){if(!frame&&allowed())frame=requestAnimationFrame(tick);}
  function clearMagnet(){if(magnet)magnet.style.removeProperty('transform');magnet=null;bounds=null;position[0]=position[1]=destination[0]=destination[1]=velocity[0]=velocity[1]=0;}
  function reset(){cancelAnimationFrame(frame);frame=0;previous=0;active=null;previewShowing=false;bubble.classList.remove('is-visible');preview.classList.remove('is-visible');clearMagnet();velocity.fill(0);}
  function cursorLabel(element) {
    const en=root.dataset.language==='en';
    if(element.matches('.note-row,.journal-card,.race-card'))return en?'Read':'阅读';
    return en?'View':'预览';
  }
  function positionPreview(x,y) {
    const width=preview.offsetWidth,height=preview.offsetHeight;
    const left=preview.dataset.presentation==='text'?(x+width+98<innerWidth?x+74:x-width-74):x-width/2;
    destination[2]=clamp(left,24,innerWidth-width-24);
    destination[3]=clamp(y-height/2,document.querySelector('.site-header').getBoundingClientRect().bottom+18,innerHeight-height-24);
    if(!previewShowing){position[2]=destination[2];position[3]=destination[3];velocity[2]=velocity[3]=0;}
  }
  new ResizeObserver(()=>{
    if(lastPointer&&allowed()&&preview.classList.contains('is-visible')){positionPreview(...lastPointer);schedule();}
  }).observe(preview);
  document.addEventListener('pointermove',event=>{
    if(event.pointerType!=='mouse'||!allowed())return;
    lastPointer=[event.clientX,event.clientY];
    const element=event.target.closest(selector);
    if(element!==active){clearMagnet();active=element;if(active?.matches(magnets)){magnet=active;bounds=active.getBoundingClientRect();}}
    const visible=Boolean(active?.matches(circleTargets));
    bubble.classList.toggle('is-visible',visible);
    if(active)label.textContent=cursorLabel(active);
    // The circle supplements the native hand cursor; keep its center exact.
    bubble.style.transform='translate3d('+event.clientX+'px,'+event.clientY+'px,0) translate(-50%,-50%)';
    if(magnet&&bounds){destination[0]=clamp((event.clientX-bounds.left-bounds.width/2)*.22,-9,9);destination[1]=clamp((event.clientY-bounds.top-bounds.height/2)*.22,-7,7);}
    const showPreview=preview.classList.contains('is-visible');
    if(showPreview)positionPreview(event.clientX,event.clientY);
    previewShowing=showPreview;
    schedule();
  },{passive:true});
  document.addEventListener('pointerdown',clearMagnet);
  document.addEventListener('keydown',reset);
  document.addEventListener('pointerleave',reset);
  window.addEventListener('scroll',reset,{passive:true});
  window.addEventListener('blur',reset);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)reset();});
  reduce.addEventListener('change',reset);fine.addEventListener('change',reset);
  new MutationObserver(()=>{
    if(root.classList.contains('reading')){if(active)reset();}
    else if(active)label.textContent=cursorLabel(active);
  }).observe(root,{attributes:true,attributeFilter:['class','data-language']});
}
