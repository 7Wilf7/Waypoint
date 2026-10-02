// Material motion belongs to the visual surfaces. Reading copy never moves.
// One frame scheduler serves every surface; idle light is sampled at 12.5 Hz.
let activeController = null;

export function initSurfaceMotion() {
  if (activeController) return activeController;
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const selector = '.project-visual, .hero-gallery-track, .about-item, .article-card, .race-card';
  const visualSelector = '.project-visual,.hero-gallery-track';
  const surfaces = new Map();
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const listeners = [];
  let destroyed = false, frame = 0, idleTimer = 0, previous = 0, sceneTime = 0;
  let layoutDirty = true, refreshQueued = false, pageActive = true;
  let keyboard = root.dataset.input === 'keyboard';
  let modalOpen = Boolean(document.querySelector('dialog[open]')) || root.classList.contains('reading');
  const allowed = () => !destroyed && !reduce.matches && !document.hidden && pageActive && !keyboard && !modalOpen;
  const canTilt = () => allowed() && fine.matches;

  function listen(target, event, handler, options) {
    target.addEventListener(event, handler, options);
    listeners.push(() => target.removeEventListener(event, handler, options));
  }
  function stop() {
    if (frame) cancelAnimationFrame(frame);
    if (idleTimer) clearTimeout(idleTimer);
    frame = 0; idleTimer = 0; previous = 0;
  }
  function spring(value, velocity, target, dt) {
    // Exact critically damped spring: mass 1, stiffness 100, damping 20.
    // Retargeting preserves velocity, including a quick reversal.
    const offset = value - target, decay = Math.exp(-10 * dt);
    const impulse = velocity + 10 * offset;
    return [target + (offset + impulse * dt) * decay,
      (velocity - 10 * impulse * dt) * decay];
  }
  function restoreVisual(state) {
    if (!state.visual || !state.ownsTransform) return;
    if (state.originalTransform) state.element.style.transform = state.originalTransform;
    else state.element.style.removeProperty('transform');
    state.ownsTransform = false;
  }
  function staticSurface(state) {
    state.hovered = false; state.pointerX = state.pointerY = 0;
    state.position.fill(0); state.velocity.fill(0);
    state.target.fill(0);
    state.target[4] = state.position[4] = state.photo ? 0 : state.visual ? 0.16 : 0.045;
    restoreVisual(state);
    state.light.style.transform = 'translate3d(0,0,0)';
    state.light.style.opacity = String(state.position[4]);
  }
  function measure(state) {
    const rect = state.element.getBoundingClientRect();
    state.rect = rect;
    state.scrollDepth = clamp((innerHeight / 2 - (rect.top + rect.height / 2)) / innerHeight, -1, 1);
    if (!observer) state.visible = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight;
  }
  function makeLight() {
    const light = document.createElement('span');
    light.className = 'material-light';
    light.setAttribute('aria-hidden', 'true');
    light.dataset.surfaceLight = '';
    light.style.pointerEvents = 'none';
    return light;
  }

  const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
    for (const entry of entries) {
      const state = surfaces.get(entry.target);
      if (!state) continue;
      state.visible = entry.isIntersecting && entry.intersectionRatio > 0;
      if (!state.visible) staticSurface(state);
    }
    layoutDirty = true;
    schedule();
  }, { threshold: [0, 0.01], rootMargin: '0px' });
  const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
    layoutDirty = true; schedule();
  });

  function refresh() {
    if (destroyed) return;
    for (const [element, state] of surfaces) {
      if (!element.isConnected || !element.matches(selector) || element.closest('dialog')) {
        observer?.unobserve(element); resizeObserver?.unobserve(element);
        restoreVisual(state);
        if (state.createdLight) state.light.remove();
        if (state.addedClass) { element.classList.remove('material-surface'); delete element.dataset.surfaceMotionClass; }
        surfaces.delete(element);
      } else if (!element.contains(state.light)) element.append(state.light);
    }
    for (const element of document.querySelectorAll(selector)) {
      if (surfaces.has(element) || element.closest('dialog')) continue;
      const existing = [...element.children].find(child => child.classList.contains('material-light'));
      const light = existing || makeLight();
      if (!existing) element.append(light);
      light.setAttribute('aria-hidden', 'true'); light.style.pointerEvents = 'none';
      const state = { element, light, createdLight: !existing || existing.hasAttribute('data-surface-light'),
        addedClass: !element.classList.contains('material-surface') || element.dataset.surfaceMotionClass === 'owned',
        originalLightTransform: light.style.transform, originalLightOpacity: light.style.opacity,
        visual: element.matches(visualSelector), photo: element.matches('.hero-gallery-track'), visible: !observer, rect: null,
        pointerX: 0, pointerY: 0, hovered: false, scrollDepth: 0,
        phase: surfaces.size * 1.9, position: [0, 0, 0, 0, 0], target: [0, 0, 0, 0, 0],
        velocity: [0, 0, 0, 0, 0], originalTransform: element.style.transform,
        ownsTransform: false };
      element.classList.add('material-surface');
      if (state.addedClass) element.dataset.surfaceMotionClass = 'owned';
      surfaces.set(element, state); staticSurface(state); measure(state);
      observer?.observe(element); resizeObserver?.observe(element);
    }
    layoutDirty = true;
    schedule();
  }
  function queueRefresh() {
    if (refreshQueued || destroyed) return;
    refreshQueued = true;
    queueMicrotask(() => { refreshQueued = false; refresh(); });
  }
  function schedule() {
    if (frame || !allowed()) return;
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = 0; }
    frame = requestAnimationFrame(tick);
  }
  function tick(now) {
    frame = 0;
    if (!allowed()) { stop(); return; }
    const dt = Math.min((now - (previous || now - 16)) / 1000, 0.1);
    previous = now; sceneTime += dt;
    if (layoutDirty) {
      for (const state of surfaces.values()) if (state.visible || !observer) measure(state);
      layoutDirty = false;
    }
    let settling = false, ambient = false;
    for (const state of surfaces.values()) {
      if (!state.visible || !state.element.isConnected) continue;
      const hover = fine.matches && state.hovered;
      const phase = sceneTime * 0.16 + state.phase;
      const driftX = state.visual && !state.photo ? Math.sin(phase) * 6 : 0;
      const driftY = state.visual && !state.photo ? Math.cos(phase * 0.7) * 4 : 0;
      ambient ||= state.visual && !state.photo;
      // Rotations are limited to 1.8 degrees. Scroll depth changes the visual
      // plane by at most six pixels; the copy surfaces never receive a transform.
      state.target[0] = state.visual && canTilt() && hover ? -state.pointerY * 1.8 : 0;
      state.target[1] = state.visual && canTilt() && hover ? state.pointerX * 1.8 : 0;
      state.target[2] = hover ? state.pointerX * (state.visual ? 10 : 7) : 0;
      state.target[3] = hover ? state.pointerY * (state.visual ? 8 : 5) : 0;
      state.target[4] = state.photo ? (hover ? 0.13 : 0) : state.visual ? (hover ? 0.22 : 0.16) : (hover ? 0.1 : 0.045);
      for (let index = 0; index < state.position.length; index++) {
        [state.position[index], state.velocity[index]] = spring(state.position[index], state.velocity[index], state.target[index], dt);
        if (Math.abs(state.target[index] - state.position[index]) > 0.015 || Math.abs(state.velocity[index]) > 0.025) settling = true;
      }
      if (state.visual) {
        const depth = fine.matches && !state.photo ? state.scrollDepth * 6 : 0;
        const transform = `perspective(1400px) translate3d(0,${depth.toFixed(2)}px,0) rotateX(${state.position[0].toFixed(3)}deg) rotateY(${state.position[1].toFixed(3)}deg)${state.photo ? ' scale(1.035)' : ''}`;
        if (state.element.style.transform !== transform) state.element.style.transform = transform;
        state.ownsTransform = true;
      }
      const transform = `translate3d(${(state.position[2] + driftX).toFixed(2)}%,${(state.position[3] + driftY).toFixed(2)}%,0) rotate(${(state.visual ? Math.sin(phase * 0.55) * 3 : 0).toFixed(2)}deg)`;
      const opacity = (state.position[4] + (state.visual && !state.photo ? Math.sin(phase * 0.8) * 0.018 : 0)).toFixed(3);
      if (state.light.style.transform !== transform) state.light.style.transform = transform;
      if (state.light.style.opacity !== opacity) state.light.style.opacity = opacity;
    }
    if (settling) schedule();
    else if (ambient) {
      // Broad, slow light can be sampled sparsely once the gesture has settled.
      // No continuous requestAnimationFrame chain runs at rest.
      idleTimer = setTimeout(() => { idleTimer = 0; schedule(); }, 80);
    } else previous = 0;
  }
  function leaveAll() {
    let changed = false;
    for (const state of surfaces.values()) if (state.hovered) { state.hovered = false; changed = true; }
    if (changed) schedule();
  }
  function updateGate() {
    const wasBlocked = modalOpen;
    modalOpen = root.classList.contains('reading') || Boolean(document.querySelector('dialog[open]'));
    if (!allowed()) {
      stop();
      if (reduce.matches || keyboard) for (const state of surfaces.values()) staticSurface(state);
      else for (const state of surfaces.values()) { state.hovered = false; state.velocity.fill(0); }
    } else { if (wasBlocked) layoutDirty = true; schedule(); }
  }
  listen(document, 'pointermove', event => {
    if (event.pointerType !== 'mouse' || !fine.matches) return;
    if (keyboard) { keyboard = false; updateGate(); }
    if (!canTilt()) return;
    const element = event.target instanceof Element ? event.target.closest(selector) : null;
    const selected = surfaces.get(element);
    for (const state of surfaces.values()) state.hovered = state === selected && state.visible;
    if (selected?.visible) {
      measure(selected);
      const rect = selected.rect;
      selected.pointerX = clamp((event.clientX - rect.left) / Math.max(1, rect.width) * 2 - 1, -1, 1);
      selected.pointerY = clamp((event.clientY - rect.top) / Math.max(1, rect.height) * 2 - 1, -1, 1);
    }
    schedule();
  }, { passive: true });
  listen(document, 'pointerleave', leaveAll);
  listen(document, 'keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || ['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return;
    keyboard = true; updateGate();
  });
  listen(window, 'scroll', () => { leaveAll(); layoutDirty = true; schedule(); }, { passive: true });
  listen(window, 'resize', () => { layoutDirty = true; schedule(); }, { passive: true });
  listen(window, 'blur', () => { pageActive = false; updateGate(); });
  listen(window, 'focus', () => { pageActive = true; updateGate(); });
  listen(document, 'visibilitychange', updateGate);
  listen(document, 'waypoint-reader', updateGate);
  listen(document, 'journal-ready', queueRefresh);
  listen(document, 'journal-loading', queueRefresh);
  listen(document, 'toggle', updateGate, true);
  listen(document, 'close', updateGate, true);
  listen(reduce, 'change', updateGate);
  listen(fine, 'change', () => { leaveAll(); if (!fine.matches) for (const state of surfaces.values()) restoreVisual(state); updateGate(); });
  const rootObserver = new MutationObserver(records => {
    if (records.some(record => record.attributeName === 'data-input')) keyboard = root.dataset.input === 'keyboard';
    if (records.some(record => ['data-language', 'data-theme'].includes(record.attributeName))) {
      leaveAll(); queueRefresh(); layoutDirty = true;
    }
    updateGate();
  });
  rootObserver.observe(root, { attributes: true, attributeFilter: ['class', 'data-input', 'data-language', 'data-theme'] });
  const bodyObserver = new MutationObserver(records => {
    if (records.some(record => record.type === 'childList')) queueRefresh();
    if (records.some(record => record.type === 'attributes')) updateGate();
  });
  bodyObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });

  function destroy() {
    if (destroyed) return;
    destroyed = true; stop();
    observer?.disconnect(); resizeObserver?.disconnect(); rootObserver.disconnect(); bodyObserver.disconnect();
    for (const remove of listeners) remove();
    for (const state of surfaces.values()) {
      restoreVisual(state);
      if (state.createdLight) state.light.remove();
      else {
        if (state.originalLightTransform) state.light.style.transform = state.originalLightTransform;
        else state.light.style.removeProperty('transform');
        if (state.originalLightOpacity) state.light.style.opacity = state.originalLightOpacity;
        else state.light.style.removeProperty('opacity');
      }
      if (state.addedClass) { state.element.classList.remove('material-surface'); delete state.element.dataset.surfaceMotionClass; }
    }
    surfaces.clear(); activeController = null;
  }
  activeController = { refresh, destroy };
  refresh(); updateGate();
  return activeController;
}
