// Transfer the mouse's momentum to content, keeping control hit areas fixed.
// Individual transforms compose with the inner scroll entrances and surfaces.
let activeController = null;
const selector = '.waypoint-home main :is(h2,h3,h4,h5,h6,p,blockquote,li,dt,dd,span,strong,small,img),.race-archive-page main :is(h1,h2,h3,h4,h5,h6,p,blockquote,li,dt,dd,span,strong,small,img),.live-dot,.hero-gallery-label,.project-visual .orbit,.product-orbit,.aevum-center';
const protectedSelector = 'button,input,textarea,select,[role="button"],[role="tab"],[contenteditable],dialog,.reader-dialog,.preview-device,.preview-display,.note-preview,.loading-state,.startup-error,.pointer-image-guide,[hidden]';
const generatedSelector = '.type-line,.type-ink,.scroll-unit,.scroll-word,.material-light,.legacy-anchor';
const headingSelector = 'h1,h2,h3,h4,h5,h6,.footer-statement';
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export function initElasticDetails() {
  if (activeController) return activeController;
  const root = document.documentElement;
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const states = new Map(), listeners = [];
  let destroyed = false, frame = 0, previous = 0, pointer = null, pending = null;
  let pageActive = true, keyboard = root.dataset.input === 'keyboard', dirty = true, refreshQueued = false, selecting = false;
  let reading = root.classList.contains('reading') || Boolean(document.querySelector('dialog[open]'));
  const allowed = () => !destroyed && fine.matches && !reduce.matches && !keyboard && !reading && !selecting && !document.hidden && pageActive && getSelection()?.isCollapsed !== false;

  function eligible(element) {
    if (!element.isConnected || !element.matches(selector) || element.matches(generatedSelector) || element.closest(protectedSelector)) return false;
    // The hero's outer lines already have their own pointer spring. Any other
    // heading may move inside a link; the surrounding link stays in place.
    if (element.closest('.editorial-hero h1')) return false;
    if (element.closest('a,summary') && !element.matches(headingSelector)) return false;
    if (element.querySelector('a,button,input,textarea,select,[role="button"],[role="tab"],.preview-device')) return false;
    if (element.closest('[aria-hidden="true"]') && !element.matches('.orbit,.live-dot')) return false;
    if (!element.matches('img,.orbit,.live-dot') && !element.textContent.trim()) return false;
    return true;
  }

  function listen(target, event, handler, options) {
    target.addEventListener(event, handler, options);
    listeners.push(() => target.removeEventListener(event, handler, options));
  }
  function property(element, name) {
    return { value: element.style.getPropertyValue(name), priority: element.style.getPropertyPriority(name) };
  }
  function restoreProperty(element, name, original) {
    if (original.value) element.style.setProperty(name, original.value, original.priority);
    else element.style.removeProperty(name);
  }
  function restore(state) {
    state.position.fill(0); state.velocity.fill(0);
    restoreProperty(state.element, 'translate', state.originalTranslate);
    restoreProperty(state.element, 'rotate', state.originalRotate);
    if (!state.originalMovingClass) state.element.classList.remove('is-elastic-moving');
    state.ownsStyles = false;
  }
  function stop(reset = true) {
    cancelAnimationFrame(frame); frame = 0; previous = 0;
    pointer = pending = null;
    if (reset) for (const state of states.values()) restore(state);
  }
  function schedule() {
    if (!frame && allowed()) frame = requestAnimationFrame(tick);
  }
  function nearestOnSegment(x, y, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const ratio = clamp(((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return { x: a.x + dx * ratio, y: a.y + dy * ratio };
  }
  function measure(state) {
    const element = state.element, rect = element.getBoundingClientRect();
    state.rect = rect;
    if (!intersection) state.visible = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight;
    state.points = [];
    if (state.ring) {
      const cx = (rect.left + rect.right) / 2 - state.position[0], cy = (rect.top + rect.bottom) / 2 - state.position[1];
      for (let index = 0; index < 32; index++) {
        const angle = index / 32 * Math.PI * 2;
        state.points.push({ x: cx + Math.cos(angle) * rect.width / 2, y: cy + Math.sin(angle) * rect.height / 2 });
      }
    }
  }
  function inject(state, move) {
    if (!state.visible || !state.element.isConnected) return;
    const dx = move.to.x - move.from.x, dy = move.to.y - move.from.y;
    const travel = Math.hypot(dx, dy);
    if (travel < .5) return;
    let nearest, distance = Infinity, cursor;
    if (state.ring) {
      for (const point of state.points) {
        const candidate = nearestOnSegment(point.x, point.y, move.from, move.to);
        const separation = Math.hypot(point.x - candidate.x, point.y - candidate.y);
        if (separation < distance) { distance = separation; nearest = point; cursor = candidate; }
      }
      if (!nearest) return;
    } else {
      const rect = state.rect;
      const cx = (rect.left + rect.right) / 2 - state.position[0], cy = (rect.top + rect.bottom) / 2 - state.position[1];
      cursor = nearestOnSegment(cx, cy, move.from, move.to);
      nearest = { x: clamp(cursor.x, rect.left - state.position[0], rect.right - state.position[0]),
        y: clamp(cursor.y, rect.top - state.position[1], rect.bottom - state.position[1]) };
      distance = Math.hypot(nearest.x - cursor.x, nearest.y - cursor.y);
      if (distance < 1) nearest = { x: cx, y: cy };
    }
    if (distance >= state.radius) return;
    const separation = Math.hypot(nearest.x - cursor.x, nearest.y - cursor.y);
    const normalX = separation > 1 ? (nearest.x - cursor.x) / separation : dx / travel;
    const normalY = separation > 1 ? (nearest.y - cursor.y) / separation : dy / travel;
    let directionX = normalX * .65 + dx / travel * .35;
    let directionY = normalY * .65 + dy / travel * .35;
    const magnitude = Math.hypot(directionX, directionY) || 1;
    directionX /= magnitude; directionY /= magnitude;
    const proximity = (1 - distance / state.radius) ** 2;
    const speed = travel / Math.max(.008, move.duration);
    const impulse = Math.min(travel, 44) * state.gain * (.35 + Math.min(speed / 900, 2)) * proximity;
    state.velocity[0] = clamp(state.velocity[0] + directionX * impulse, -360, 360);
    state.velocity[1] = clamp(state.velocity[1] + directionY * impulse, -360, 360);
    if (state.turn) state.velocity[2] = clamp(state.velocity[2] + directionX * impulse * .18, -50, 50);
  }
  function apply(state) {
    const [x, y, angle] = state.position;
    state.element.style.setProperty('translate', `calc(${state.baseX} + ${x.toFixed(3)}px) calc(${state.baseY} + ${y.toFixed(3)}px)${state.baseZ ? ' ' + state.baseZ : ''}`, state.originalTranslate.priority);
    if (state.turn) state.element.style.setProperty('rotate', `calc(${state.baseAngle} + ${angle.toFixed(3)}deg)`, state.originalRotate.priority);
    state.element.classList.add('is-elastic-moving'); state.ownsStyles = true;
  }
  function tick(now) {
    frame = 0;
    if (!allowed()) { stop(); return; }
    const dt = Math.min((now - (previous || now - 16.667)) / 1000, .05);
    previous = now;
    if (dirty || pending) {
      for (const state of states.values()) if (state.visible) measure(state);
      dirty = false;
    }
    if (pending) {
      for (const state of states.values()) inject(state, pending);
      pending = null;
    }
    let moving = false;
    const steps = Math.max(1, Math.ceil(dt / (1 / 120))), step = dt / steps;
    for (const state of states.values()) {
      if (!state.visible || !state.element.isConnected) { restore(state); continue; }
      for (let substep = 0; substep < steps; substep++) for (let axis = 0; axis < 3; axis++) {
        // Mass 1, stiffness 100, damping 10: a brief kick and a damped return.
        state.velocity[axis] += (-100 * state.position[axis] - 10 * state.velocity[axis]) * step;
        state.position[axis] += state.velocity[axis] * step;
      }
      const displacement = Math.hypot(state.position[0], state.position[1]);
      if (displacement > state.limit) {
        const ratio = state.limit / displacement;
        state.position[0] *= ratio; state.position[1] *= ratio;
        state.velocity[0] *= .25; state.velocity[1] *= .25;
      }
      state.position[2] = clamp(state.position[2], -state.turn, state.turn);
      const unsettled = state.position.some(value => Math.abs(value) > .035) || state.velocity.some(value => Math.abs(value) > .08);
      if (unsettled) { apply(state); moving = true; }
      else if (state.ownsStyles) restore(state);
    }
    if (moving) schedule();
    else previous = 0;
  }
  function refresh() {
    if (destroyed) return;
    // Register incrementally: async content and line wrapping must not reset
    // the velocity of elements that are already returning to their position.
    const candidates = new Set();
    for (const element of document.querySelectorAll(selector)) {
      if (!eligible(element)) continue;
      let nested = false;
      for (let parent = element.parentElement; parent; parent = parent.parentElement) if (candidates.has(parent)) { nested = true; break; }
      if (!nested) candidates.add(element);
    }
    for (const [element, state] of states) if (!candidates.has(element)) {
      intersection?.unobserve(element); resizing?.unobserve(element);
      restore(state);
      if (!state.originalClass) element.classList.remove('elastic-detail');
      if (!state.originalInlineClass) element.classList.remove('elastic-inline');
      states.delete(element);
    }
    for (const element of candidates) {
      if (states.has(element)) continue;
      const ring = element.matches('.orbit');
      const heading = element.matches(headingSelector);
      const image = element.matches('img,.aevum-center,.product-orbit');
      const copy = !ring && !heading && !image;
      const originalTranslate = property(element, 'translate'), originalRotate = property(element, 'rotate');
      const computed = getComputedStyle(element);
      const translated = computed.translate === 'none' ? ['0px', '0px'] : computed.translate.split(/\s+/);
      const angle = computed.rotate === 'none' ? '0deg' : computed.rotate;
      const rect = element.getBoundingClientRect();
      const state = { element, ring, originalTranslate, originalRotate, originalClass: element.classList.contains('elastic-detail'),
        originalInlineClass: element.classList.contains('elastic-inline'),
        originalMovingClass: element.classList.contains('is-elastic-moving'), baseX: translated[0], baseY: translated[1] || '0px', baseZ: translated[2],
        baseAngle: angle, turn: ring || copy || /\s/.test(angle) ? 0 : heading ? .65 : .35,
        limit: ring ? 26 : heading ? 14 : image ? 8 : 5,
        radius: ring ? 72 : heading ? 85 : 54, gain: ring ? 4.2 : heading ? 2.5 : image ? 1.5 : .85,
        position: [0, 0, 0], velocity: [0, 0, 0], points: [], ownsStyles: false,
        visible: rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight };
      element.classList.add('elastic-detail'); states.set(element, state);
      if (computed.display === 'inline') element.classList.add('elastic-inline');
      intersection?.observe(element); resizing?.observe(element); measure(state);
    }
    dirty = true;
  }
  function queueRefresh() {
    if (refreshQueued || destroyed) return;
    refreshQueued = true;
    queueMicrotask(() => { refreshQueued = false; refresh(); });
  }
  function gate() {
    reading = root.classList.contains('reading') || Boolean(document.querySelector('dialog[open]'));
    if (!allowed()) stop();
  }
  const intersection = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
    for (const entry of entries) {
      const state = states.get(entry.target); if (!state) continue;
      state.visible = entry.isIntersecting && entry.intersectionRatio > 0;
      if (!state.visible) restore(state);
    }
    if (![...states.values()].some(state => state.ownsStyles)) stop(false);
    dirty = true;
  }, { threshold: [0, .01] });
  const resizing = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => { dirty = true; });
  const observer = new MutationObserver(records => {
    if (records.some(record => record.attributeName === 'data-input')) keyboard = root.dataset.input === 'keyboard';
    if (records.some(record => ['data-language', 'data-theme'].includes(record.attributeName))) queueRefresh();
    gate();
  });
  observer.observe(root, { attributes: true, attributeFilter: ['class', 'data-input', 'data-language', 'data-theme'] });
  listen(document, 'pointermove', event => {
    if (event.pointerType !== 'mouse' || !fine.matches) return;
    if (keyboard) { keyboard = false; gate(); }
    if (!allowed()) { stop(); return; }
    if (event.target.closest('dialog,.reader-dialog,.preview-device,.preview-display')) { pointer = pending = null; return; }
    const next = { x: event.clientX, y: event.clientY, time: event.timeStamp };
    if (pointer && next.time - pointer.time < 250) pending = { from: pending?.from || pointer, to: next, duration: Math.min(.1, Math.max(.008, (next.time - (pending?.from || pointer).time) / 1000)) };
    pointer = next;
    if (pending) schedule();
  }, { passive: true });
  listen(document, 'pointerleave', () => { pointer = pending = null; });
  listen(document, 'pointerdown', event => { if (event.pointerType === 'mouse' && !event.target.closest('a,button,summary')) { selecting = true; stop(); } });
  listen(document, 'pointerup', () => { selecting = false; gate(); });
  listen(document, 'pointercancel', () => { selecting = false; gate(); });
  listen(document, 'selectionchange', gate);
  listen(document, 'keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || ['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return;
    keyboard = true; gate();
  });
  listen(document, 'visibilitychange', gate); listen(document, 'waypoint-reader', gate);
  listen(document, 'toggle', gate, true); listen(document, 'close', gate, true);
  listen(window, 'blur', () => { pageActive = false; gate(); });
  listen(window, 'focus', () => { pageActive = true; dirty = true; });
  listen(window, 'scroll', () => { dirty = true; pointer = pending = null; gate(); }, { passive: true });
  listen(window, 'resize', () => { dirty = true; });
  listen(reduce, 'change', gate); listen(fine, 'change', gate);
  listen(document, 'journal-ready', queueRefresh); listen(document, 'journal-loading', queueRefresh);
  const contentObserver = new MutationObserver(records => {
    if (records.some(record => !record.target.closest?.('.pointer-image-guide,.preview-device,.preview-display'))) queueRefresh();
  });
  const content = document.querySelector('main');
  if (content) contentObserver.observe(content, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-hidden','hidden'] });
  activeController = { refresh, destroy() {
    if (destroyed) return;
    destroyed = true; stop(); intersection?.disconnect(); resizing?.disconnect(); observer.disconnect(); contentObserver.disconnect();
    listeners.forEach(remove => remove());
    for (const state of states.values()) {
      restore(state); if (!state.originalClass) state.element.classList.remove('elastic-detail');
      if (!state.originalInlineClass) state.element.classList.remove('elastic-inline');
    }
    states.clear(); activeController = null;
  } };
  refresh(); return activeController;
}
