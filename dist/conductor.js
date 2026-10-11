import {copy} from './i18n.js';

// One authored diagram, selected by language. The animation never blocks text.
export function initConductor() {
  const feature = document.querySelector('.conductor-card');
  if (!feature) return null;
  const root = document.documentElement;
  const dialog = document.querySelector('.conductor-dialog');
  const images = [...document.querySelectorAll('[data-conductor-image]')];
  const buttons = [...document.querySelectorAll('[data-conductor-toggle]')];
  const status = feature.querySelector('.conductor-status');
  const detail = dialog.querySelector('.conductor-detail');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const listeners = [];
  let visible = false, paused = false, failed = false, destroyed = false;
  let ticket = 0, requested = '', shown = '';
  const language = () => root.dataset.language === 'en' ? 'en' : 'zh';
  const words = () => copy[language()];
  const source = animated => './assets/conductor/conductor-' + language() + (animated ? '.gif' : '.webp');
  const canPlay = () => !paused && !failed && !reduce.matches && !document.hidden &&
    (visible || dialog.open) && (!root.classList.contains('reading') || dialog.open);

  function listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    listeners.push(() => target.removeEventListener(type, handler, options));
  }
  function applyImage(url, animated) {
    for (const image of images) {
      if (image.getAttribute('src') !== url) image.src = url;
      image.alt = words().conductorImage;
    }
    shown = url;
    feature.dataset.conductorPlaying = String(animated);
    dialog.dataset.conductorPlaying = String(animated);
  }
  function syncControls(loading = false) {
    const playing = canPlay();
    const label = reduce.matches ? words().conductorReduced : failed ? words().retry :
      playing ? words().conductorPause : words().conductorPlay;
    for (const button of buttons) {
      button.hidden = false;
      button.disabled = reduce.matches;
      button.setAttribute('aria-label', label);
      button.setAttribute('aria-pressed', String(playing));
      button.querySelector('span').textContent = label;
    }
    detail.setAttribute('aria-label', words().conductorPan);
    status.textContent = failed ? words().conductorFailed : loading ? words().conductorLoading : '';
  }
  function sync() {
    if (destroyed) return;
    const animated = canPlay();
    const url = source(animated);
    for (const image of images) image.alt = words().conductorImage;
    syncControls();
    if (requested === url) return;
    requested = url;
    const current = ++ticket;
    if (!animated) {
      applyImage(url, false);
      return;
    }
    // The readable poster stays visible during download/decoding of the GIF.
    if (shown !== source(false)) applyImage(source(false), false);
    syncControls(true);
    const prepared = new Image();
    prepared.src = url;
    prepared.decode().then(() => {
      if (destroyed || ticket !== current || !canPlay()) return;
      applyImage(url, true);
      syncControls();
    }).catch(() => {
      if (destroyed || ticket !== current) return;
      failed = true;
      requested = '';
      sync();
    });
  }
  for (const button of buttons) listen(button, 'click', () => {
    if (failed) { failed = false; paused = false; requested = ''; }
    else paused = !paused;
    sync();
  });
  const expand = feature.querySelector('[data-conductor-expand]');
  expand.hidden = false;
  listen(expand, 'click', () => {
    dialog.showModal();
    root.classList.add('reading');
    sync();
    dialog.querySelector('[data-conductor-close]').focus({preventScroll:true});
  });
  listen(dialog.querySelector('[data-conductor-close]'), 'click', () => dialog.close());
  listen(dialog, 'click', event => { if (event.target === dialog) dialog.close(); });
  listen(dialog, 'close', () => {
    if (!document.querySelector('.reader-dialog')?.open) root.classList.remove('reading');
    sync();
    feature.querySelector('[data-conductor-expand]').focus({preventScroll:true});
  });
  const closeOnNavigation = () => { if (dialog.open) dialog.close(); };
  listen(window, 'popstate', closeOnNavigation);
  listen(window, 'hashchange', closeOnNavigation);
  listen(document, 'visibilitychange', sync);
  listen(reduce, 'change', sync);
  const preferences = new MutationObserver(() => {
    if (root.dataset.view === 'races' && dialog.open) dialog.close();
    sync();
  });
  preferences.observe(root, {attributes:true,attributeFilter:['data-language','class','data-view']});
  const viewport = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    sync();
  }, {threshold:0.05});
  viewport.observe(feature.querySelector('.conductor-figure'));
  sync();
  return {destroy() {
    destroyed = true;
    ticket++;
    listeners.forEach(remove => remove());
    preferences.disconnect();
    viewport.disconnect();
    applyImage(source(false), false);
  }};
}

initConductor();
