// The backdrop has its own transform; body, main and the readable preview never scale.
let controller = null;

export function initAmbientMotion() {
  if (controller) return controller;
  const backdrop = document.querySelector('.ambient-depth');
  if (!backdrop) return null;
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const listeners = [];
  let destroyed = false, frame = 0, pageActive = true, previous = 0, maximumScroll = 1;
  let x = 0, y = 0, targetX = 0, targetY = 0;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const blocked = () => reduce.matches || root.dataset.input === 'keyboard' || root.classList.contains('reading');
  function listen(target, event, handler, options) {
    target.addEventListener(event, handler, options);
    listeners.push(() => target.removeEventListener(event, handler, options));
  }
  function stop() { cancelAnimationFrame(frame); frame = 0; previous = 0; }
  function schedule() { if (!frame && !destroyed && !document.hidden && pageActive) frame = requestAnimationFrame(update); }
  function measure() { maximumScroll = Math.max(1, root.scrollHeight - innerHeight); schedule(); }
  function update(now) {
    frame = 0;
    if (destroyed || document.hidden || !pageActive) return;
    const staticView = blocked();
    const progress = staticView ? .16 : clamp(scrollY / maximumScroll, 0, 1);
    const dt = Math.min((now - (previous || now - 16)) / 1000, .08);
    previous = now;
    const follow = 1 - Math.exp(-12 * dt);
    if (staticView) { x = y = targetX = targetY = 0; }
    else { x += (targetX - x) * follow; y += (targetY - y) * follow; }
    backdrop.style.setProperty('--ambient-x', x.toFixed(2) + 'px');
    backdrop.style.setProperty('--ambient-y', (y - progress * 65).toFixed(2) + 'px');
    backdrop.style.setProperty('--ambient-scale', (1 + progress * .28).toFixed(4));
    backdrop.style.setProperty('--ambient-turn', (-6 + progress * 21).toFixed(3) + 'deg');
    backdrop.style.setProperty('--ambient-lift', (-progress * 110).toFixed(2) + 'px');
    backdrop.dataset.backgroundProgress = progress.toFixed(4);
    if (!staticView && (Math.abs(targetX - x) > .04 || Math.abs(targetY - y) > .04)) schedule();
    else previous = 0;
  }
  listen(window, 'scroll', schedule, {passive: true});
  listen(window, 'resize', measure, {passive: true});
  listen(document, 'pointermove', event => {
    if (event.pointerType !== 'mouse' || !fine.matches || blocked() || event.target.closest('.preview-device')) return;
    targetX = (event.clientX / innerWidth - .5) * 16;
    targetY = (event.clientY / innerHeight - .5) * 12;
    schedule();
  }, {passive: true});
  listen(document, 'pointerleave', () => { targetX = targetY = 0; schedule(); });
  listen(document, 'visibilitychange', () => { if (document.hidden) stop(); else measure(); });
  listen(document, 'waypoint-reader', schedule);
  listen(window, 'blur', () => { pageActive = false; targetX = targetY = 0; stop(); });
  listen(window, 'focus', () => { pageActive = true; schedule(); });
  listen(reduce, 'change', schedule);
  const observer = new MutationObserver(schedule);
  observer.observe(root, {attributes: true, attributeFilter: ['class','data-input']});
  const resize = new ResizeObserver(measure);
  resize.observe(document.querySelector('main'));
  controller = {refresh: measure, destroy() {
    if (destroyed) return;
    destroyed = true; stop(); observer.disconnect(); resize.disconnect(); listeners.forEach(remove => remove());
    for (const name of ['x','y','scale','turn','lift']) backdrop.style.removeProperty('--ambient-' + name);
    delete backdrop.dataset.backgroundProgress; controller = null;
  }};
  measure(); return controller;
}
