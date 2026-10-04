import { copy } from './i18n.js';

export const themes = ['dark', 'light', 'moss', 'gray'];
const names = { dark: 'themeDark', light: 'themeLight', moss: 'themeMoss', gray: 'themeGray' };
let controller = null;

// All visitor and owner pages share the same saved background and cycle order.
export function initTheme() {
  if (controller) return controller;
  const root = document.documentElement;
  const buttons = [...document.querySelectorAll('.theme-toggle')];
  const announcement = document.querySelector('.theme-announcement');
  const words = () => copy[root.dataset.language === 'en' ? 'en' : 'zh'];
  const current = () => themes.includes(root.dataset.theme) ? root.dataset.theme : 'dark';
  const next = () => themes[(themes.indexOf(current()) + 1) % themes.length];
  const format = (template, values) => template.replace(/\{(\w+)\}/g, (_, key) => values[key]);

  function sync() {
    const w = words();
    const label = format(w.themeSwitch, { current: w[names[current()]], next: w[names[next()]] });
    for (const button of buttons) {
      button.setAttribute('aria-label', label);
      button.title = label;
    }
    const color = document.querySelector('meta[name="theme-color"]');
    if (color) color.content = getComputedStyle(root).getPropertyValue('--bg').trim();
  }
  function apply(value, announce = false) {
    root.dataset.theme = themes.includes(value) ? value : 'dark';
    sync();
    if (announce && announcement) announcement.textContent = format(words().themeChanged, { current: words()[names[current()]] });
  }
  function cycle(event) {
    if (event.detail === 0) root.dataset.input = 'keyboard';
    apply(next(), true);
    try { localStorage.setItem('waypoint-theme', current()); } catch { /* Optional preference. */ }
  }
  function stored(event) {
    if (event.key === 'waypoint-theme' && themes.includes(event.newValue)) apply(event.newValue);
  }
  buttons.forEach(button => button.addEventListener('click', cycle));
  window.addEventListener('storage', stored);
  const observer = new MutationObserver(sync);
  observer.observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-language'] });
  controller = { sync, destroy() {
    observer.disconnect();
    buttons.forEach(button => button.removeEventListener('click', cycle));
    window.removeEventListener('storage', stored);
    controller = null;
  } };
  apply(current());
  return controller;
}
