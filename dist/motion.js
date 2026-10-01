export function initWelcome() {
  const root = document.documentElement;
  const screen = document.querySelector('.welcome-screen');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let seen = false;
  try { seen = sessionStorage.getItem('waypoint-welcome') === 'seen'; } catch { /* Optional visit preference. */ }
  if (seen || reduce.matches || (location.hash && location.hash !== '#home')) return Promise.resolve();
  try { sessionStorage.setItem('waypoint-welcome', 'seen'); } catch { /* Optional visit preference. */ }
  root.classList.add('intro-pending');
  screen.hidden = false;
  const word = screen.querySelector('.welcome-word');
  const greetings = ['你好', 'Hello', 'Bonjour', 'Hola', 'こんにちは'];
  let index = 0;
  let timer;
  let exit;
  return new Promise(resolve => {
    let finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      exit?.cancel();
      screen.hidden = true;
      root.classList.remove('intro-pending');
      document.removeEventListener('keydown', skip);
      reduce.removeEventListener('change', onReduce);
      resolve();
    }
    function skip() { root.dataset.input = 'keyboard'; root.classList.add('intro-complete'); finish(); }
    function onReduce() { if (reduce.matches) finish(); }
    function next() {
      word.textContent = index < greetings.length ? greetings[index] : root.dataset.language === 'en' ? 'Hello. I’m Wilf.' : '你好，我是 Wilf。';
      if (index <= greetings.length) {
        index++;
        timer = setTimeout(next, index === 1 ? 300 : index > greetings.length ? 430 : 155);
      } else {
        exit = screen.animate([{transform:'translateY(0)'},{transform:'translateY(-125%)'}], {duration:800,easing:'cubic-bezier(0.77, 0, 0.175, 1)',fill:'forwards'});
        exit.finished.then(finish, finish);
      }
    }
    document.addEventListener('keydown', skip, {once:true});
    reduce.addEventListener('change', onReduce);
    next();
  });
}

export function initMotion() {
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const wide = matchMedia('(min-width: 1100px)');
  const easeOut = 'cubic-bezier(0.23, 1, 0.32, 1)';
  const easeInOut = 'cubic-bezier(0.77, 0, 0.175, 1)';
  const running = new Set();
  const preview = document.querySelector('.note-preview');
  setTimeout(() => root.classList.add('intro-complete'), 1100);

  function stopDecorativeMotion() {
    running.forEach(animation => animation.cancel());
    running.clear();
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

  // One entrance per chapter. Content stays visible if JS or observation fails.
  function reveal(element, frames, options) {
    if (reduce.matches || root.dataset.input === 'keyboard') return;
    const animation = element.animate(frames, options);
    running.add(animation);
    animation.finished.then(() => running.delete(animation), () => running.delete(animation));
  }
  const revealObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      revealObserver.unobserve(entry.target);
      const element = entry.target;
      const index = [...element.parentElement.children].indexOf(element);
      const stagger = element.matches('.about-item, .note-row') ? Math.min(index, 3) * 60 : 0;
      reveal(element, [
        { opacity: 0, transform: 'translateY(24px)' },
        { opacity: 1, transform: 'translateY(0)' }
      ], { duration: 600, delay: stagger, easing: easeOut });
      if (element.matches('.project-card')) {
        const orbit = element.querySelector('.orbit-three');
        reveal(orbit, [
          { transform: 'translate(-50%, -50%) rotate(-60deg)', opacity: 0 },
          { transform: 'translate(-50%, -50%) rotate(0deg)', opacity: 0.55 }
        ], { duration: 1000, easing: easeInOut });
      }
    }
  }, { threshold: 0.12, rootMargin: '0px 0px -24px 0px' });
  document.querySelectorAll('.section-topline, .section-intro, .about-item, .section-heading-row, .project-card, .note-row, .now-section, .footer-main').forEach(element => revealObserver.observe(element));

  // Damped physical spring for the image, active only while it is moving.
  // mass: 1, stiffness: 100, damping: 10 (the existing design skill's preset).
  const visual = document.querySelector('.hero-visual');
  const image = visual.querySelector('.mountain-image');
  const target = [0, 0, 0, 0];
  const position = [0, 0, 0, 0];
  const velocity = [0, 0, 0, 0];
  let pointerY = 0;
  let scrollOffset = 0;
  let frame = 0;
  let previousTime = 0;
  const canTrack = () => finePointer.matches && !reduce.matches && root.dataset.input !== 'keyboard' && !root.classList.contains('reading') && !document.hidden;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function tick(time) {
    frame = 0;
    if (!canTrack()) { resetImage(); return; }
    const dt = Math.min((time - (previousTime || time - 16)) / 1000, 1 / 60);
    previousTime = time;
    let settled = true;
    for (let index = 0; index < position.length; index++) {
      const acceleration = (target[index] - position[index]) * 100 - velocity[index] * 10;
      velocity[index] += acceleration * dt;
      position[index] += velocity[index] * dt;
      if (Math.abs(target[index] - position[index]) > 0.02 || Math.abs(velocity[index]) > 0.02) settled = false;
    }
    visual.style.transform = 'perspective(1400px) rotateX(' + position[0].toFixed(3) + 'deg) rotateY(' + position[1].toFixed(3) + 'deg)';
    image.style.transform = 'translate3d(' + position[2].toFixed(3) + 'px,' + position[3].toFixed(3) + 'px,0) scale(1.10)';
    if (!settled) frame = requestAnimationFrame(tick);
    else previousTime = 0;
  }
  function schedule() { if (!frame && canTrack()) frame = requestAnimationFrame(tick); }
  function resetImage() {
    cancelAnimationFrame(frame);
    frame = 0;
    previousTime = 0;
    pointerY = 0;
    scrollOffset = 0;
    target.fill(0); position.fill(0); velocity.fill(0);
    visual.style.removeProperty('transform');
    image.style.removeProperty('transform');
  }
  visual.addEventListener('pointermove', event => {
    if (!canTrack()) return;
    const rect = visual.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    target[0] = -y * 4;
    target[1] = x * 4;
    target[2] = -x * 18;
    pointerY = -y * 18;
    target[3] = pointerY + scrollOffset;
    schedule();
  });
  visual.addEventListener('pointerleave', () => {
    target[0] = 0; target[1] = 0; target[2] = 0; pointerY = 0;
    target[3] = scrollOffset;
    schedule();
  });
  window.addEventListener('scroll', () => {
    if (!canTrack()) return;
    const rect = visual.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > innerHeight) return;
    scrollOffset = clamp(-rect.top * 0.07, -22, 22);
    target[3] = pointerY + scrollOffset;
    schedule();
  }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) resetImage(); });
  document.addEventListener('keydown', () => resetImage());
  reduce.addEventListener('change', () => { if (reduce.matches) { stopDecorativeMotion(); resetImage(); } });
  finePointer.addEventListener('change', () => { if (!finePointer.matches) { resetImage(); preview.classList.remove('is-visible'); } });
  wide.addEventListener('change', () => { if (!wide.matches) preview.classList.remove('is-visible'); });

  // A visual preview behind the pointer. It never intercepts a click.
  const previewImage = preview.querySelector('img');
  const previewCategory = preview.querySelector('.preview-category');
  const previewAssets = { trail: './assets/mountain.jpg', memory: './assets/aevum.png', waypoint: './favicon.svg' };
  document.querySelectorAll('.note-row').forEach(row => {
    row.addEventListener('pointerenter', () => {
      if (!finePointer.matches || !wide.matches || reduce.matches || root.dataset.input === 'keyboard' || root.classList.contains('reading')) return;
      const key = row.getAttribute('href').slice(6);
      previewImage.src = previewAssets[key];
      preview.dataset.note = key;
      previewCategory.textContent = row.querySelector('.note-category').textContent;
      preview.style.left = '0';
      preview.style.top = '0';
      preview.classList.add('is-visible');
    });
    row.addEventListener('pointerleave', () => preview.classList.remove('is-visible'));
    row.addEventListener('click', () => preview.classList.remove('is-visible'));
  });
  window.addEventListener('scroll', () => preview.classList.remove('is-visible'), { passive: true });

  document.querySelectorAll('.spotlight-surface').forEach(surface => {
    surface.addEventListener('pointermove', event => {
      if (!finePointer.matches || reduce.matches) return;
      const rect = surface.getBoundingClientRect();
      surface.style.setProperty('--spotlight-x', (event.clientX - rect.left) + 'px');
      surface.style.setProperty('--spotlight-y', (event.clientY - rect.top) + 'px');
    });
  });
  initPointerFeedback();
}

function initPointerFeedback() {
  const root=document.documentElement;
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');
  const fine=matchMedia('(hover: hover) and (pointer: fine)');
  const bubble=document.querySelector('.pointer-bubble');
  const label=bubble.querySelector('span');
  const preview=document.querySelector('.note-preview');
  const selector='a[href],button:not([disabled])';
  const magnets='.button,.site-nav a,.language-toggle,.theme-toggle,.footer-link,.preview-tab';
  let active=null, magnet=null, bounds=null, frame=0, previous=0, previewShowing=false;
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
  function reset(){cancelAnimationFrame(frame);frame=0;previous=0;active=null;previewShowing=false;root.classList.remove('pointer-feedback');bubble.classList.remove('is-visible');clearMagnet();velocity.fill(0);}
  function cursorLabel(element) {
    const en=root.dataset.language==='en';
    if(element.matches('.note-row,.journal-card'))return en?'Read':'阅读';
    if(element.matches('.preview-tab'))return en?'View':'预览';
    if(element.matches('.theme-toggle,.language-toggle'))return en?'Switch':'切换';
    if(element.matches('a[target="_blank"]'))return en?'Open':'打开';
    return en?'Explore':'探索';
  }
  document.addEventListener('pointermove',event=>{
    if(event.pointerType!=='mouse'||!allowed())return;
    const element=event.target.closest(selector);
    if(element!==active){clearMagnet();active=element;if(active?.matches(magnets)){magnet=active;bounds=active.getBoundingClientRect();}}
    const visible=Boolean(active&&!active.matches('.skip-link'));
    bubble.classList.toggle('is-visible',visible);
    root.classList.toggle('pointer-feedback',visible);
    if(active)label.textContent=cursorLabel(active);
    // The circle is the cursor itself: keep its center exact, even during fast moves.
    bubble.style.transform='translate3d('+event.clientX+'px,'+event.clientY+'px,0) translate(-50%,-50%)';
    if(magnet&&bounds){destination[0]=clamp((event.clientX-bounds.left-bounds.width/2)*.22,-9,9);destination[1]=clamp((event.clientY-bounds.top-bounds.height/2)*.22,-7,7);}
    const showPreview=preview.classList.contains('is-visible');
    if(showPreview) {
      const width=preview.offsetWidth;
      const height=preview.offsetHeight;
      destination[2]=clamp(event.clientX-width/2,24,innerWidth-width-24);
      destination[3]=clamp(event.clientY-height/2,document.querySelector('.site-header').getBoundingClientRect().bottom+18,innerHeight-height-24);
      if(!previewShowing){position[2]=destination[2];position[3]=destination[3];velocity[2]=velocity[3]=0;}
    }
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
}
