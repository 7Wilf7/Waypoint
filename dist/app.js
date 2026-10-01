import { notesByLanguage } from './content.js';
import { copy } from './i18n.js';
import { initMotion } from './motion.js';

const root = document.documentElement;
const themeButton = document.querySelector('.theme-toggle');
const languageButtons = [...document.querySelectorAll('.language-toggle')];
const announcement = document.querySelector('.theme-announcement');
const themeColor = document.querySelector('meta[name="theme-color"]');
const dialog = document.querySelector('.reader-dialog');
const readerTitle = document.querySelector('#reader-title');
const readerBody = document.querySelector('#reader-body');
let returnHash = '#writing';
let readingKey = null;
let routing = false;

const language = () => root.dataset.language === 'en' ? 'en' : 'zh';
const words = () => copy[language()];
const notes = () => notesByLanguage[language()];

function syncThemeUI() {
  const dark = root.dataset.theme === 'dark';
  const label = dark ? words().toLight : words().toDark;
  themeButton.setAttribute('aria-label', label);
  themeButton.title = label;
  themeColor.content = dark ? '#101113' : '#f5f6f8';
}

function applyLanguage(next, announce = false) {
  root.dataset.language = next === 'en' ? 'en' : 'zh';
  root.lang = language() === 'en' ? 'en' : 'zh-CN';
  const text = words();
  document.querySelectorAll('[data-i18n]').forEach(element => {
    // Markup comes only from our authored translation dictionary.
    element.innerHTML = text[element.dataset.i18n];
  });
  document.querySelectorAll('[data-i18n-aria]').forEach(element => element.setAttribute('aria-label', text[element.dataset.i18nAria]));
  document.querySelectorAll('[data-i18n-alt]').forEach(element => element.alt = text[element.dataset.i18nAlt]);
  document.querySelector('meta[name="description"]').content = text.description;
  document.title = text.pageTitle;
  languageButtons.forEach(button => {
    button.textContent = language() === 'en' ? '中' : 'EN';
    button.lang = language() === 'en' ? 'zh-CN' : 'en';
    button.setAttribute('aria-label', text.languageLabel);
    button.title = text.languageLabel;
  });
  syncThemeUI();
  if (readingKey && dialog.open) renderNote(readingKey, dialog.dataset.input === 'keyboard', true);
  if (announce) announcement.textContent = text.languageChanged;
  else announcement.textContent = '';
  document.querySelector('.note-preview').classList.remove('is-visible');
}

applyLanguage(language());
languageButtons.forEach(button => button.addEventListener('click', event => {
  if (event.detail === 0) root.dataset.input = 'keyboard';
  const next = language() === 'zh' ? 'en' : 'zh';
  try { localStorage.setItem('waypoint-language', next); } catch { /* Optional preference. */ }
  applyLanguage(next, true);
}));
themeButton.addEventListener('click', () => {
  root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem('waypoint-theme', root.dataset.theme); } catch { /* Optional preference. */ }
  syncThemeUI();
  announcement.textContent = root.dataset.theme === 'dark' ? words().darkChanged : words().lightChanged;
});
window.addEventListener('storage', event => {
  if (event.key === 'waypoint-theme' && ['light', 'dark'].includes(event.newValue)) {
    root.dataset.theme = event.newValue;
    syncThemeUI();
  }
  if (event.key === 'waypoint-language' && ['zh', 'en'].includes(event.newValue)) applyLanguage(event.newValue);
});

function renderNote(key, keyboard = false, preservePosition = false) {
  const note = notes()[key];
  if (!note) return false;
  const position = dialog.scrollTop;
  readerTitle.textContent = note.title;
  document.querySelector('#reader-category').textContent = note.category;
  document.querySelector('#reader-lead').textContent = note.lead;
  readerBody.replaceChildren();
  for (const text of note.paragraphs) {
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    readerBody.append(paragraph);
  }
  if (note.products) {
    const products = document.createElement('div');
    products.className = 'reader-products';
    for (const product of note.products) {
      const item = document.createElement('div');
      const image = document.createElement('img');
      image.src = product.image;
      image.alt = '';
      image.width = 48;
      image.height = 48;
      const name = document.createElement('strong');
      name.textContent = product.name;
      const label = document.createElement('span');
      label.textContent = product.label;
      item.append(image, name, label);
      products.append(item);
    }
    readerBody.append(products);
  }
  if (note.link) {
    const link = document.createElement('a');
    link.href = note.link.href;
    link.className = 'button button-primary reader-project-link';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = note.link.label;
    readerBody.append(link);
  }
  readingKey = key;
  document.title = note.title + ' — Waypoint';
  if (!dialog.open) {
    dialog.dataset.input = keyboard ? 'keyboard' : 'pointer';
    root.classList.add('reading');
    document.querySelector('.note-preview').classList.remove('is-visible');
    dialog.showModal();
  }
  dialog.scrollTop = preservePosition ? position : 0;
  return true;
}

function applyRoute() {
  const match = location.hash.match(/^#read\/([a-z]+)$/);
  if (match && notes()[match[1]]) {
    if (!dialog.open && !history.state?.reading) returnHash = match[1] === 'aevum' ? '#projects' : '#writing';
    renderNote(match[1]);
  } else if (dialog.open) {
    routing = true;
    dialog.close();
    routing = false;
  }
}

document.addEventListener('click', event => {
  const link = event.target.closest('a[href^="#read/"]');
  if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
  const key = link.getAttribute('href').slice(6);
  if (!notes()[key]) return;
  event.preventDefault();
  if (!dialog.open) returnHash = location.hash.startsWith('#read/') ? (key === 'aevum' ? '#projects' : '#writing') : location.hash;
  history.pushState({ reading: true }, '', '#read/' + key);
  renderNote(key, event.detail === 0);
});
document.querySelector('.reader-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
dialog.addEventListener('close', () => {
  root.classList.remove('reading');
  document.title = words().pageTitle;
  readingKey = null;
  if (!routing && location.hash.startsWith('#read/')) history.replaceState(null, '', location.pathname + location.search + returnHash);
});
window.addEventListener('popstate', applyRoute);
window.addEventListener('hashchange', applyRoute);
applyRoute();

const navLinks = [...document.querySelectorAll('.site-nav a')];
const indicator = document.createElement('span');
indicator.className = 'nav-indicator';
indicator.setAttribute('aria-hidden', 'true');
document.querySelector('.site-nav').prepend(indicator);
const sectionObserver = new IntersectionObserver(entries => {
  const active = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
  if (!active || readingKey) return;
  navLinks.forEach((link, index) => {
    if (link.getAttribute('href') === '#' + active.target.id) {
      link.setAttribute('aria-current', 'location');
      indicator.style.transform = 'translateX(' + (index * 100) + '%)';
      indicator.classList.add('is-visible');
    } else link.removeAttribute('aria-current');
  });
}, { rootMargin: '-15% 0px -50% 0px', threshold: [0, 0.1, 0.3] });
document.querySelectorAll('#about, #projects, #writing').forEach(section => sectionObserver.observe(section));
initMotion();
