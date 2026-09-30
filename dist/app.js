import { notes } from './content.js';

const root = document.documentElement;
const themeButton = document.querySelector('.theme-toggle');
const announcement = document.querySelector('.theme-announcement');
const themeColor = document.querySelector('meta[name="theme-color"]');

function syncThemeUI() {
  const dark = root.dataset.theme === 'dark';
  const label = dark ? '切换为浅色模式' : '切换为深色模式';
  themeButton.setAttribute('aria-label', label);
  themeButton.title = label;
  themeColor.content = dark ? '#101113' : '#f5f6f8';
}

syncThemeUI();
themeButton.addEventListener('click', () => {
  root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem('waypoint-theme', root.dataset.theme); } catch { /* Preference is optional. */ }
  syncThemeUI();
  announcement.textContent = root.dataset.theme === 'dark' ? '已切换为深色模式' : '已切换为浅色模式';
});

window.addEventListener('storage', event => {
  if (event.key === 'waypoint-theme' && ['light', 'dark'].includes(event.newValue)) {
    root.dataset.theme = event.newValue;
    syncThemeUI();
  }
});

const dialog = document.querySelector('.reader-dialog');
const readerTitle = document.querySelector('#reader-title');
const readerBody = document.querySelector('#reader-body');
let returnHash = '#writing';
let readingKey = null;
let routing = false;
let priorTitle = document.title;

function renderNote(key, keyboard = false) {
  const note = notes[key];
  if (!note) return false;
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
  document.title = `${note.title} — Waypoint`;
  dialog.dataset.input = keyboard ? 'keyboard' : 'pointer';
  if (!dialog.open) {
    root.classList.add('reading');
    dialog.showModal();
  }
  dialog.scrollTop = 0;
  return true;
}

function applyRoute() {
  const match = location.hash.match(/^#read\/([a-z]+)$/);
  if (match && notes[match[1]]) {
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
  if (!notes[key]) return;
  event.preventDefault();
  if (!dialog.open) {
    returnHash = location.hash.startsWith('#read/') ? (key === 'aevum' ? '#projects' : '#writing') : location.hash;
    priorTitle = document.title;
  }
  history.pushState({ reading: true }, '', `#read/${key}`);
  renderNote(key, event.detail === 0);
});

document.querySelector('.reader-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
dialog.addEventListener('close', () => {
  root.classList.remove('reading');
  document.title = priorTitle;
  readingKey = null;
  if (!routing && location.hash.startsWith('#read/')) history.replaceState(null, '', location.pathname + location.search + returnHash);
});
window.addEventListener('popstate', applyRoute);
window.addEventListener('hashchange', applyRoute);
applyRoute();

const navLinks = [...document.querySelectorAll('.site-nav a')];
const sectionObserver = new IntersectionObserver(entries => {
  const active = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
  if (!active || readingKey) return;
  navLinks.forEach(link => {
    if (link.getAttribute('href') === `#${active.target.id}`) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
}, { rootMargin: '-15% 0px -50% 0px', threshold: [0, 0.1, 0.3] });
document.querySelectorAll('#about, #projects, #writing').forEach(section => sectionObserver.observe(section));

const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
document.querySelectorAll('.spotlight-surface').forEach(surface => {
  surface.addEventListener('pointermove', event => {
    if (!finePointer.matches || reducedMotion.matches) return;
    const rect = surface.getBoundingClientRect();
    surface.style.setProperty('--spotlight-x', `${event.clientX - rect.left}px`);
    surface.style.setProperty('--spotlight-y', `${event.clientY - rect.top}px`);
  });
});
