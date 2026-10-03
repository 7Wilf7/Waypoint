// The title's outer lines follow the visitor; their inner inks own the entrance.
let controller = null;

export function initHeroMotion() {
  if (controller) return controller;
  const hero = document.querySelector('.editorial-hero');
  const heading = hero?.querySelector('h1');
  if (!heading) return null;
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const listeners = [], target = [0, 0, 0], position = [0, 0, 0], velocity = [0, 0, 0];
  let lines = [], frame = 0, previous = 0, bounds, visible = true, active = true, destroyed = false;
  const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
  const allowed = () => !destroyed && !reduce.matches && !document.hidden && active &&
    root.dataset.input !== 'keyboard' && !root.classList.contains('reading');
  function listen(element, name, handler, options) {
    element.addEventListener(name, handler, options);
    listeners.push(() => element.removeEventListener(name, handler, options));
  }
  function syncLines() {
    const elements = [...heading.querySelectorAll(':scope>.type-line')];
    if (lines.length === elements.length && lines.every((line, index) => line.element === elements[index])) return;
    lines.forEach(line => { line.element.style.transform = line.originalTransform; });
    lines = elements.map(element => ({ element, originalTransform: element.style.transform }));
  }
  function measure() {
    const rect = hero.getBoundingClientRect();
    bounds = { left: rect.left, top: rect.top + scrollY, width: rect.width, height: rect.height };
    visible = rect.bottom > 0 && rect.top < innerHeight;
    target[2] = clamp((scrollY - bounds.top) / Math.max(1, bounds.height * .72));
  }
  function stop() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0; previous = 0;
  }
  function reset() {
    stop(); target.fill(0); position.fill(0); velocity.fill(0);
    syncLines(); lines.forEach(line => { line.element.style.transform = line.originalTransform; });
  }
  function schedule() {
    if (!allowed()) { reset(); return; }
    if (!visible) { stop(); return; }
    if (!frame) frame = requestAnimationFrame(tick);
  }
  function tick(now) {
    frame = 0;
    if (!allowed()) { reset(); return; }
    if (!visible) { stop(); return; }
    syncLines();
    const dt = Math.min((now - (previous || now - 16)) / 1000, 1 / 30);
    previous = now;
    let moving = false;
    for (let index = 0; index < position.length; index++) {
      velocity[index] += ((target[index] - position[index]) * 100 - velocity[index] * 10) * dt;
      position[index] += velocity[index] * dt;
      if (Math.abs(target[index] - position[index]) > .001 || Math.abs(velocity[index]) > .001) moving = true;
      else { position[index] = target[index]; velocity[index] = 0; }
    }
    const progress = clamp(position[2]);
    lines.forEach(({ element }, index) => {
      const second = index % 2;
      const x = position[0] * (second ? -14 : 10) + progress * (second ? 42 : -32);
      const y = position[1] * (second ? -10 : 8) + progress * (second ? 16 : -18);
      const turn = position[0] * (second ? -.45 : .35) + progress * (second ? .8 : -.6);
      element.style.transform = 'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px,0) rotate(' +
        turn.toFixed(3) + 'deg) scale(' + (1 + progress * .045).toFixed(4) + ')';
    });
    if (moving) frame = requestAnimationFrame(tick);
    else previous = 0;
  }
  function onScroll() { measure(); schedule(); }
  function releasePointer() { target[0] = target[1] = 0; schedule(); }
  listen(hero, 'pointermove', event => {
    if (event.pointerType !== 'mouse' || !fine.matches || !allowed() || event.target.closest('a,button')) {
      releasePointer(); return;
    }
    if (!bounds) measure();
    target[0] = clamp((event.clientX - bounds.left) / bounds.width * 2 - 1, -1, 1);
    target[1] = clamp((event.clientY - (bounds.top - scrollY)) / bounds.height * 2 - 1, -1, 1);
    schedule();
  }, { passive: true });
  listen(hero, 'pointerleave', releasePointer);
  listen(window, 'scroll', onScroll, { passive: true });
  listen(window, 'resize', onScroll, { passive: true });
  listen(window, 'blur', () => { active = false; reset(); });
  listen(window, 'focus', () => { active = true; onScroll(); });
  listen(document, 'visibilitychange', () => { if (document.hidden) reset(); else onScroll(); });
  listen(document, 'waypoint-reader', onScroll);
  listen(reduce, 'change', onScroll);
  listen(fine, 'change', releasePointer);
  const rootObserver = new MutationObserver(onScroll);
  rootObserver.observe(root, { attributes: true, attributeFilter: ['class', 'data-input', 'data-language'] });
  const contentObserver = new MutationObserver(() => { syncLines(); onScroll(); });
  contentObserver.observe(heading, { childList: true, subtree: true });
  const resizeObserver = new ResizeObserver(onScroll);
  resizeObserver.observe(hero);
  document.fonts?.ready.then(() => { if (!destroyed) onScroll(); });
  function destroy() {
    if (destroyed) return;
    destroyed = true; reset(); listeners.forEach(remove => remove());
    rootObserver.disconnect(); contentObserver.disconnect(); resizeObserver.disconnect();
    controller = null;
  }
  controller = { destroy };
  syncLines(); onScroll();
  return controller;
}
