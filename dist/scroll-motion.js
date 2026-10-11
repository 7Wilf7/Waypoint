// Native scroll triggers an entrance; each entrance finishes even after scrolling stops.
let controller = null;

export function initScrollMotion() {
  if (controller) return controller;
  const main = document.querySelector('.waypoint-home main');
  if (!main) return null;
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = matchMedia('(pointer: coarse)');
  const surfaceDistance = () => coarse.matches ? 56 : 44;
  const easeOut = getComputedStyle(root).getPropertyValue('--ease-out').trim() || 'cubic-bezier(.23, 1, .32, 1)';
  const records = new Map();
  const listeners = [];
  const headings = 'h1,h2,h3,.footer-statement';
  const passages = '.about-description>p,.section-description,.project-description,.preview-heading>p';
  const surfaces = '.section-topline,.about-item,.article-card,.race-spotlight,.race-highlight,.project-card,.preview-heading,.preview-options,.trail-reading-heading,.race-subheading';
  let frame = 0, destroyed = false, pageActive = true, refreshDirty = false;
  const clamp = value => Math.max(0, Math.min(1, value));
  const blocked = () => reduce.matches || root.dataset.input === 'keyboard' || root.classList.contains('reading') || typeof main.animate !== 'function';

  function listen(target, event, handler, options) {
    target.addEventListener(event, handler, options);
    listeners.push(() => target.removeEventListener(event, handler, options));
  }
  function stop() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }
  function schedule() {
    if (!frame && !destroyed && !document.hidden) frame = requestAnimationFrame(update);
  }
  function splitText(element, heading) {
    const units = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    const locale = root.dataset.language === 'en' ? 'en' : 'zh';
    const segmenter = locale === 'zh' && typeof Intl.Segmenter === 'function'
      ? new Intl.Segmenter(locale, { granularity: 'grapheme' }) : null;
    for (const node of textNodes) {
      const fragment = document.createDocumentFragment();
      const raw = locale === 'en' ? node.textContent.match(/\s+|[^\s]+/g) || [] :
        segmenter ? [...segmenter.segment(node.textContent)].map(part => part.segment) : [...node.textContent];
      const segments = [];
      for (const segment of raw) {
        const previous = segments.at(-1) || '';
        // A period is part of its word; CJK closing marks and Latin names also
        // keep their native line-break constraints instead of becoming blocks.
        if (previous.trim() && (/^(?:\p{Pe}|\p{Pf}|[,.!?;:，。！？；：、…%‰°])+$/u.test(segment) ||
          /^(?:\p{Ps}|\p{Pi})+$/u.test(previous) ||
          (/^[a-z0-9]+$/i.test(previous) && /^[a-z0-9]+$/i.test(segment)))) segments[segments.length - 1] += segment;
        else segments.push(segment);
      }
      for (const segment of segments) {
        if (!segment.trim()) { fragment.append(document.createTextNode(segment)); continue; }
        const unit = document.createElement('span');
        unit.className = heading ? 'scroll-unit' : 'scroll-word';
        unit.textContent = segment;
        units.push(unit); fragment.append(unit);
      }
      node.replaceWith(fragment);
    }
    return units;
  }
  function prepareHeading(element) {
    // The authored <br> and muted span remain the line and color boundaries.
    const nodes = [...element.childNodes], lines = [[]], fragment = document.createDocumentFragment();
    const semanticHeading = element.matches('h1,h2,h3,h4,h5,h6');
    if (semanticHeading) element.setAttribute('aria-label', nodes.map(node => node.nodeName === 'BR' ? ' ' : node.textContent).join(''));
    for (const node of nodes) {
      if (node.nodeName === 'BR') lines.push([]);
      else lines.at(-1).push(node);
    }
    for (const line of lines) {
      const mask = document.createElement('span'); mask.className = 'type-line';
      if (semanticHeading) mask.setAttribute('aria-hidden', 'true');
      const ink = document.createElement('span'); ink.className = 'type-ink';
      ink.append(...line); mask.append(ink); fragment.append(mask);
    }
    element.replaceChildren(fragment);
    // Keep the hero's native text shaping and spacing intact throughout entry.
    // Its outer lines follow the pointer; only each inner line slides into view.
    return element.id === 'hero-heading' ? [...element.querySelectorAll(':scope>.type-line>.type-ink')] : splitText(element, true);
  }
  function register(element, kind) {
    const existing = records.get(element);
    // Language changes retain the section node but replace its authored children.
    if (existing && (kind === 'surface' || existing.units.every(unit => element.contains(unit)))) return;
    const played = existing?.played || false;
    const phase = existing?.phase || 'waiting';
    if (existing) cancel(existing);
    const originalAriaLabel = existing ? existing.originalAriaLabel : element.getAttribute('aria-label');
    const units = kind === 'heading' ? prepareHeading(element) : kind === 'passage' ? splitText(element, false) : [];
    const variant = element.id === 'hero-heading' ? 'line' : element.id === 'trails-heading' ? 'spread' : element.id === 'projects-heading' ? 'turn' : element.matches('.footer-statement') ? 'rise' : 'lift';
    const state = { element, kind, units, variant, played, direction: existing?.direction || 1, phase: phase === 'running' ? 'complete' : phase,
      applied: -1, generation: 0, animations: new Set(), originalTransform: existing?.originalTransform ?? element.style.transform,
      originalOpacity: existing?.originalOpacity ?? element.style.opacity, originalAriaLabel };
    element.classList.add('scroll-' + kind);
    if (kind === 'heading') element.dataset.scrollVariant = variant;
    records.set(element, state); observer?.observe(element);
    apply(state, state.phase === 'waiting' ? 0 : 1);
    element.dataset.revealState = state.phase;
  }
  function refresh() {
    refreshDirty = false;
    for (const [element, state] of records) if (!element.isConnected) { finish(state); observer?.unobserve(element); records.delete(element); }
    main.querySelectorAll(headings).forEach(element => register(element, 'heading'));
    main.querySelectorAll(passages).forEach(element => register(element, 'passage'));
    main.querySelectorAll(surfaces).forEach(element => register(element, 'surface'));
    schedule();
  }
  function apply(state, progress) {
    if (Math.abs(state.applied - progress) < .001) return;
    state.applied = progress;
    state.element.dataset.scrollProgress = progress.toFixed(3);
    if (state.kind === 'heading') {
      if (state.variant === 'line') {
        const remaining = 1 - progress;
        state.units.forEach(unit => {
          unit.style.transform = remaining < .001 ? '' : 'translate3d(0,' + (remaining * 20 * state.direction).toFixed(2) + '%,0)';
          unit.style.opacity = String(progress);
        });
        return;
      }
      const spread = .58, reveal = 1 - spread;
      state.units.forEach((unit, index) => {
        const local = clamp((progress - index / Math.max(1, state.units.length - 1) * spread) / reveal);
        const remaining = 1 - local;
        if (remaining < .001) unit.style.transform = '';
        else if (state.variant === 'spread') unit.style.transform =
          'translate3d(' + (remaining * (index % 2 ? 28 : -28)).toFixed(2) + 'px,' + (remaining * 70 * state.direction).toFixed(2) + '%,0) scale(' + (1 + remaining * .18).toFixed(3) + ')';
        else if (state.variant === 'turn') unit.style.transform =
          'perspective(600px) translate3d(0,' + (remaining * 95 * state.direction).toFixed(2) + '%,0) rotateY(' + (remaining * -65).toFixed(2) + 'deg)';
        else if (state.variant === 'lift') unit.style.transform =
          'perspective(700px) translate3d(0,' + (remaining * 112 * state.direction).toFixed(2) + '%,0) rotateX(' + (remaining * 55 * state.direction).toFixed(2) + 'deg)';
        else unit.style.transform =
          'translate3d(0,' + (remaining * 105 * state.direction).toFixed(2) + '%,0) rotate(' + (remaining * 6 * state.direction).toFixed(2) + 'deg) scale(' + (.9 + local * .1).toFixed(3) + ')';
        unit.style.opacity = String(local);
      });
    } else if (state.kind === 'passage') {
      state.units.forEach((unit, index) => {
        const local = clamp((progress - index / Math.max(1, state.units.length - 1) * .72) / .28);
        unit.style.opacity = (.18 + local * .82).toFixed(3);
      });
    } else {
      const remaining = 1 - progress;
      state.element.style.transform = remaining < .001 ? state.originalTransform :
        'translate3d(0,' + (remaining * surfaceDistance() * state.direction).toFixed(2) + 'px,0)';
      state.element.style.opacity = progress >= 1 ? state.originalOpacity : String(.22 + .78 * progress);
    }
  }
  function cancel(state) {
    state.generation++;
    for (const animation of state.animations) animation.cancel();
    state.animations.clear();
  }
  function finish(state) {
    // The resting style is readable before playback. Cancellation cannot strand hidden text.
    cancel(state); apply(state, 1);
    state.played = true; state.phase = 'complete';
    state.element.dataset.revealState = state.phase;
  }
  function arm(state, direction = state.direction) {
    if (state.direction !== direction) state.applied = -1;
    state.direction = direction;
    cancel(state); apply(state, 0);
    state.played = false; state.phase = 'waiting';
    state.element.dataset.revealState = state.phase;
  }
  function showStatic(state) {
    if (state.phase === 'running') finish(state);
    else {
      apply(state, 1);
      state.phase = state.played ? 'complete' : 'static';
      state.element.dataset.revealState = state.phase;
    }
  }
  function play(state) {
    const entrances = state.kind === 'heading' ? state.units.map(unit => ({
      target: unit, from: {transform: unit.style.transform || 'none', opacity: 0},
      to: {transform: 'none', opacity: 1}
    })) : state.kind === 'passage' ? state.units.map(unit => ({
      target: unit, from: {opacity: .18}, to: {opacity: 1}
    })) : [{target: state.element,
      from: {transform: 'translate3d(0,' + (surfaceDistance() * state.direction) + 'px,0)', opacity: .22},
      to: {transform: state.originalTransform || 'none', opacity: state.originalOpacity || '1'}}];
    state.played = true; state.phase = 'running'; apply(state, 1);
    state.element.dataset.revealState = state.phase;
    const generation = ++state.generation;
    const smallHeading = state.element.matches('h3');
    const duration = state.kind === 'heading' ? smallHeading || state.variant === 'line' ? 500 : 650 : 400;
    const groups = state.kind === 'heading' ? smallHeading ? 3 : 7 : state.kind === 'passage' ? 3 : 0;
    const finished = [];
    try {
      entrances.forEach(({target, from, to}, index) => {
        // Bound the stagger, including long English headings and Chinese passages.
        const delay = Math.round(index / Math.max(1, entrances.length - 1) * Math.min(groups, entrances.length - 1)) * 40;
        const animation = target.animate([from, to], {duration, delay, easing: easeOut, fill: 'backwards'});
        state.animations.add(animation);
        finished.push(animation.finished.then(() => state.animations.delete(animation), () => state.animations.delete(animation)));
      });
    } catch { finish(state); return; }
    Promise.all(finished).then(() => {
      if (!destroyed && records.get(state.element) === state && state.generation === generation) {
        state.phase = 'complete'; state.element.dataset.revealState = state.phase;
        schedule();
      }
    });
  }
  function finishRunning() {
    for (const state of records.values()) if (state.animations.size) finish(state);
  }
  function update() {
    frame = 0;
    if (destroyed || document.hidden) return;
    if (refreshDirty) refresh();
    // Accessibility and reading temporarily make everything readable. They do
    // not consume entrances for sections the visitor has not reached yet.
    if (blocked()) { for (const state of records.values()) showStatic(state); return; }
    if (!pageActive) return;
    // A complete exit on either side arms every kind of content. Measure the
    // resting layout before changing styles, including waiting parent surfaces.
    const geometry = [...records.values()].filter(state => state.element.isConnected).map(state => {
      const rect = state.element.getBoundingClientRect();
      let shift = 0;
      for (let element = state.element; element && element !== main; element = element.parentElement) {
        const surface = records.get(element);
        if (surface?.kind === 'surface' && surface.phase === 'waiting') shift += surfaceDistance() * surface.direction;
      }
      return { state, top: rect.top - shift, height: rect.height };
    });
    const atEnd = Math.ceil(scrollY + innerHeight) >= document.documentElement.scrollHeight - 2;
    const atStart = scrollY <= 2;
    for (const { state, top, height } of geometry) {
      if (state.phase === 'running') continue;
      if (state.phase === 'complete') {
        if (top > innerHeight + 64) arm(state, 1);
        else if (top + height < -64) arm(state, -1);
        continue;
      }
      if (state.phase === 'static') {
        if (top >= innerHeight) arm(state, 1);
        else if (top + height <= 0) arm(state, -1);
        else finish(state); // Keep currently visible text readable when pointer input resumes.
        continue;
      }
      if (top >= innerHeight || top + height <= 0) {
        const direction = top >= innerHeight ? 1 : -1;
        if (state.direction !== direction) arm(state, direction);
        continue;
      }
      const readableTop = innerHeight - Math.min(height * .8, innerHeight * .4) - 24;
      const start = state.kind === 'heading'
        ? state.element.matches('h3') ? readableTop : Math.min(innerHeight * .78, readableTop)
        : innerHeight * .88;
      const crossed = state.direction === 1 ? top <= start : top + height >= innerHeight - start;
      if (crossed || (state.direction === 1 ? atEnd : atStart)) play(state);
    }
    // WAAPI finishes independently. Scroll sampling still has no idle RAF loop.
  }
  const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(schedule, { rootMargin: '80px 0px' });
  const contentObserver = new MutationObserver(() => { refreshDirty = true; schedule(); });
  contentObserver.observe(main, { childList: true, subtree: true });
  const resizeObserver = new ResizeObserver(schedule);
  resizeObserver.observe(main);
  const rootObserver = new MutationObserver(schedule);
  rootObserver.observe(root, { attributes: true, attributeFilter: ['class', 'data-input', 'data-language'] });
  listen(window, 'scroll', schedule, { passive: true });
  listen(window, 'resize', schedule, { passive: true });
  listen(document, 'visibilitychange', () => {
    if (document.hidden) { stop(); finishRunning(); }
    else schedule();
  });
  listen(window, 'blur', () => { pageActive = false; stop(); finishRunning(); });
  listen(window, 'focus', () => { pageActive = true; schedule(); });
  listen(document, 'waypoint-reader', schedule);
  listen(document, 'journal-ready', () => { refreshDirty = true; schedule(); });
  listen(reduce, 'change', schedule);
  document.fonts?.ready.then(schedule);

  function destroy() {
    if (destroyed) return;
    destroyed = true; stop();
    observer?.disconnect(); contentObserver.disconnect(); resizeObserver.disconnect(); rootObserver.disconnect();
    listeners.forEach(remove => remove());
    for (const state of records.values()) {
      for (const animation of state.animations) animation.cancel();
      state.animations.clear();
      if (state.kind === 'surface') {
        state.element.style.transform = state.originalTransform; state.element.style.opacity = state.originalOpacity;
      } else {
        // Unwrap the display-only segmentation, keeping authored spans and breaks.
        if (state.variant !== 'line') state.units.forEach(unit => unit.replaceWith(document.createTextNode(unit.textContent)));
        if (state.kind === 'heading' && state.element.querySelector(':scope>.type-line>.type-ink')) {
          const lines = [...state.element.querySelectorAll(':scope>.type-line')];
          const fragment = document.createDocumentFragment();
          lines.forEach((line, index) => {
            if (index) fragment.append(document.createElement('br'));
            fragment.append(...line.firstElementChild.childNodes);
          });
          state.element.replaceChildren(fragment);
        }
      }
      state.element.classList.remove('scroll-' + state.kind); delete state.element.dataset.scrollProgress;
      delete state.element.dataset.revealState;
      if (state.kind === 'heading') delete state.element.dataset.scrollVariant;
      if (state.kind === 'heading' && state.element.matches('h1,h2,h3,h4,h5,h6')) {
        if (state.originalAriaLabel === null) state.element.removeAttribute('aria-label');
        else state.element.setAttribute('aria-label', state.originalAriaLabel);
      }
    }
    records.clear(); controller = null;
  }
  controller = { refresh, destroy };
  refresh();
  return controller;
}
