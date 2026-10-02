import {copy} from './i18n.js';

let controller = null;

export function initAmbientAudio() {
  if (controller) return controller;
  const button = document.querySelector('.sound-toggle');
  const audio = document.querySelector('#ambient-audio');
  if (!button || !audio) return null;
  const root = document.documentElement;
  const listeners = [];
  let destroyed = false, wanted = true, pending = false, sequence = 0, unavailable = false;
  try { wanted = localStorage.getItem('waypoint-sound') !== 'off'; } catch {}
  if (!audio.getAttribute('src')) audio.src = new URL('./assets/audio/ambient.m4a', import.meta.url).href;
  const suspended = () => document.hidden || root.classList.contains('reading');
  const words = () => copy[root.dataset.language === 'en' ? 'en' : 'zh'];
  audio.volume = .14;
  audio.loop = true;
  function listen(target, event, handler, options) {
    target.addEventListener(event, handler, options);
    listeners.push(() => target.removeEventListener(event, handler, options));
  }
  function save() { try { localStorage.setItem('waypoint-sound', wanted ? 'on' : 'off'); } catch {} }
  function sync() {
    const playing = wanted && !audio.paused && !suspended();
    const state = playing ? 'playing' : pending ? 'loading' : unavailable ? 'error' : 'paused';
    const label = words()[playing ? 'musicPause' : pending ? 'musicLoading' : unavailable ? 'musicUnavailable' : 'musicPlay'];
    button.dataset.sound = state;
    button.setAttribute('aria-pressed', String(playing));
    button.setAttribute('aria-label', label); button.title = label;
  }
  function pause() { sequence++; pending = false; audio.pause(); sync(); }
  async function play() {
    if (destroyed || !wanted || suspended() || pending || !audio.paused) { sync(); return; }
    const ticket = ++sequence;
    if (unavailable) audio.load();
    pending = true; unavailable = false; sync();
    try {
      // A fresh visit may reject audible autoplay. The first real gesture retries.
      await audio.play();
      if (destroyed) return;
      if (!wanted || suspended()) { audio.pause(); return; }
      if (ticket !== sequence) return;
    } catch (error) {
      if (ticket === sequence) unavailable = error.name !== 'NotAllowedError' && error.name !== 'AbortError';
    } finally {
      if (ticket === sequence) { pending = false; sync(); }
    }
  }
  button.hidden = false;
  listen(button, 'click', () => {
    // The unlock listener ignores this control: its own action is authoritative.
    if (pending || (wanted && !audio.paused)) { wanted = false; save(); pause(); }
    else { wanted = true; save(); void play(); }
  });
  const unlock = event => {
    if (event.target.closest('.sound-toggle') || !wanted || !audio.paused || unavailable) return;
    if (event.type === 'keydown' && (event.ctrlKey || event.metaKey || event.altKey || !['Enter',' '].includes(event.key))) return;
    void play();
  };
  listen(document, 'pointerdown', unlock, {passive: true});
  listen(document, 'keydown', unlock);
  listen(document, 'visibilitychange', () => { if (suspended()) pause(); else if (wanted) void play(); });
  listen(document, 'waypoint-reader', () => { if (suspended()) pause(); else if (wanted) void play(); });
  for (const event of ['playing','pause','ended']) listen(audio, event, () => {
    if (!wanted || suspended() || destroyed) { if (!audio.paused) audio.pause(); }
    sync();
  });
  listen(audio, 'error', () => { sequence++; pending = false; unavailable = true; sync(); });
  const observer = new MutationObserver(records => {
    if (records.some(record => record.attributeName === 'class')) {
      if (suspended()) pause(); else if (wanted) void play();
    }
    sync();
  });
  observer.observe(root, {attributes: true, attributeFilter: ['class','data-language']});
  controller = {destroy() {
    if (destroyed) return;
    destroyed = true; pause(); observer.disconnect(); listeners.forEach(remove => remove());
    audio.removeAttribute('src'); audio.load(); button.hidden = true; delete button.dataset.sound;
    controller = null;
  }};
  sync(); if (wanted) void play(); return controller;
}
