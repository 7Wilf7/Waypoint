import { copy } from './i18n.js';

let activeController = null;

export function initHeroGallery() {
  if (activeController) return activeController;
  const gallery = document.querySelector('.hero-gallery');
  if (!gallery) return null;
  const root = document.documentElement;
  const slides = [...gallery.querySelectorAll('.hero-photo')];
  const controls = gallery.querySelector('.hero-gallery-controls');
  const pauseButton = gallery.querySelector('.hero-gallery-pause');
  const count = gallery.querySelector('.hero-gallery-count');
  const announcement = gallery.querySelector('.hero-gallery-announcement');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const listeners = [];
  let index = 0, requested = 0, timer = 0, sequence = 0, destroyed = false;
  let visible = false, hovered = false, pageActive = true, paused = false;
  let pendingAutomatic = false, swipeStart = null;
  const words = () => copy[root.dataset.language === 'en' ? 'en' : 'zh'];
  const canPlay = () => !destroyed && !paused && !hovered && visible && pageActive &&
    !document.hidden && !reduce.matches && !root.classList.contains('reading');
  const positionLabel = () => words().heroPhotoPosition.replace('{current}', index + 1).replace('{total}', slides.length);

  function listen(target, event, handler, options) {
    target.addEventListener(event, handler, options);
    listeners.push(() => target.removeEventListener(event, handler, options));
  }
  function clearTimer() {
    clearTimeout(timer);
    timer = 0;
  }
  function sync() {
    clearTimer();
    if (!canPlay() && pendingAutomatic) { sequence++; pendingAutomatic = false; requested = index; }
    const label = reduce.matches ? words().heroPhotosReduced : paused ? words().heroPlayPhotos : words().heroPausePhotos;
    pauseButton.setAttribute('aria-label', label);
    pauseButton.title = label;
    pauseButton.disabled = reduce.matches;
    gallery.classList.toggle('is-paused', paused || reduce.matches);
    gallery.dataset.galleryPlaying = String(canPlay());
    if (canPlay() && !pendingAutomatic) timer = setTimeout(() => { timer = 0; void select(index + 1); }, 5800);
  }

  async function select(next, manual = false, keyboard = false) {
    clearTimer();
    const ticket = ++sequence;
    pendingAutomatic = !manual;
    if (manual) { paused = true; sync(); }
    next = (next + slides.length) % slides.length;
    requested = next;
    const image = slides[next].querySelector('img');
    // Keep the current photograph visible until the requested one is decoded.
    image.loading = 'eager';
    try { await image.decode(); }
    catch {
      if (ticket === sequence && !destroyed) {
        pendingAutomatic = false;
        requested = index;
        if (manual) announcement.textContent = words().imageFailed;
        sync();
      }
      return;
    }
    if (destroyed || ticket !== sequence) return;
    pendingAutomatic = false;
    if (!manual && !canPlay()) { requested = index; sync(); return; }
    gallery.classList.toggle('is-instant', keyboard || reduce.matches || root.dataset.input === 'keyboard');
    slides.forEach((slide, ordinal) => {
      slide.classList.toggle('is-active', ordinal === next);
      slide.setAttribute('aria-hidden', String(ordinal !== next));
    });
    index = next;
    count.firstChild.nodeValue = String(index + 1).padStart(2, '0') + ' ';
    gallery.dataset.galleryActive = String(index + 1);
    if (manual) announcement.textContent = positionLabel() + ' · ' + image.alt;
    sync();
  }

  controls.hidden = false;
  count.querySelector('span').textContent = '/ ' + String(slides.length).padStart(2, '0');
  gallery.dataset.galleryActive = '1';
  gallery.classList.add('gallery-ready');
  for (const button of gallery.querySelectorAll('[data-gallery-step]')) {
    listen(button, 'click', event => void select(requested + Number(button.dataset.galleryStep), true, event.detail === 0));
  }
  listen(pauseButton, 'click', () => { paused = !paused; sync(); });
  listen(gallery, 'keydown', event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    root.dataset.input = 'keyboard';
    void select(requested + (event.key === 'ArrowRight' ? 1 : -1), true, true);
  });
  listen(document, 'keydown', () => { paused = true; sync(); });
  listen(gallery, 'pointerenter', event => { if (event.pointerType === 'mouse') { hovered = true; sync(); } });
  listen(gallery, 'pointerleave', () => { hovered = false; swipeStart = null; sync(); });
  listen(gallery, 'pointerdown', event => {
    if (event.pointerType === 'mouse' || event.target.closest('.hero-gallery-controls')) return;
    swipeStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
  }, { passive: true });
  listen(gallery, 'pointerup', event => {
    const start = swipeStart;
    swipeStart = null;
    if (!start || start.id !== event.pointerId) return;
    const x = event.clientX - start.x, y = event.clientY - start.y;
    if (Math.abs(x) > 50 && Math.abs(y) < Math.abs(x) * .65) void select(requested + (x < 0 ? 1 : -1), true);
  }, { passive: true });
  listen(gallery, 'pointercancel', () => { swipeStart = null; });
  listen(document, 'visibilitychange', sync);
  listen(document, 'waypoint-reader', sync);
  listen(window, 'blur', () => { pageActive = false; sync(); });
  listen(window, 'focus', () => { pageActive = true; sync(); });
  listen(reduce, 'change', sync);
  const observer = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting && entries[0].intersectionRatio >= .25;
    sync();
  }, { threshold: [0, .25] });
  observer.observe(gallery);
  const languageObserver = new MutationObserver(sync);
  languageObserver.observe(root, { attributes: true, attributeFilter: ['data-language', 'class'] });
  sync();

  activeController = {
    destroy() {
      if (destroyed) return;
      destroyed = true; sequence++; clearTimer();
      observer.disconnect(); languageObserver.disconnect(); listeners.forEach(remove => remove());
      controls.hidden = true;
      gallery.classList.remove('gallery-ready', 'is-paused', 'is-instant');
      delete gallery.dataset.galleryActive; delete gallery.dataset.galleryPlaying;
      slides.forEach((slide, ordinal) => { slide.classList.toggle('is-active', ordinal === 0); slide.setAttribute('aria-hidden', String(ordinal !== 0)); });
      count.firstChild.nodeValue = '01 ';
      announcement.textContent = '';
      activeController = null;
    }
  };
  return activeController;
}
