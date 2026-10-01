export function initMotion() {
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const wide = matchMedia('(min-width: 1100px)');
  const easeOut = 'cubic-bezier(0.23, 1, 0.32, 1)';
  const easeInOut = 'cubic-bezier(0.77, 0, 0.175, 1)';
  const running = new Set();
  const preview = document.querySelector('.note-preview');
  setTimeout(() => root.classList.add('intro-complete'), 1100);

  function stopDecorativeMotion() {
    running.forEach(animation => animation.cancel());
    running.clear();
    preview.classList.remove('is-visible');
  }
  document.addEventListener('keydown', event => {
    if (['Tab', 'Enter', ' ', 'ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', 'Escape'].includes(event.key)) {
      root.dataset.input = 'keyboard';
      root.classList.add('intro-complete');
      stopDecorativeMotion();
    }
  });
  document.addEventListener('pointerdown', () => { root.dataset.input = 'pointer'; });
  document.addEventListener('pointermove', event => {
    if (event.pointerType === 'mouse' && root.dataset.input !== 'pointer') root.dataset.input = 'pointer';
  }, { passive: true });

  // One entrance per chapter. Content stays visible if JS or observation fails.
  function reveal(element, frames, options) {
    if (reduce.matches || root.dataset.input === 'keyboard') return;
    const animation = element.animate(frames, options);
    running.add(animation);
    animation.finished.then(() => running.delete(animation), () => running.delete(animation));
  }
  const revealObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      revealObserver.unobserve(entry.target);
      const element = entry.target;
      const index = [...element.parentElement.children].indexOf(element);
      const stagger = element.matches('.about-item, .note-row') ? Math.min(index, 3) * 60 : 0;
      reveal(element, [
        { opacity: 0, transform: 'translateY(24px)' },
        { opacity: 1, transform: 'translateY(0)' }
      ], { duration: 600, delay: stagger, easing: easeOut });
      if (element.matches('.project-card')) {
        const orbit = element.querySelector('.orbit-three');
        reveal(orbit, [
          { transform: 'translate(-50%, -50%) rotate(-60deg)', opacity: 0 },
          { transform: 'translate(-50%, -50%) rotate(0deg)', opacity: 0.55 }
        ], { duration: 1000, easing: easeInOut });
      }
    }
  }, { threshold: 0.12, rootMargin: '0px 0px -24px 0px' });
  document.querySelectorAll('.section-topline, .section-intro, .about-item, .section-heading-row, .project-card, .note-row, .now-section, .footer-main').forEach(element => revealObserver.observe(element));

  // Damped physical spring for the image, active only while it is moving.
  // mass: 1, stiffness: 100, damping: 10 (the existing design skill's preset).
  const visual = document.querySelector('.hero-visual');
  const image = visual.querySelector('.mountain-image');
  const target = [0, 0, 0, 0];
  const position = [0, 0, 0, 0];
  const velocity = [0, 0, 0, 0];
  let pointerY = 0;
  let scrollOffset = 0;
  let frame = 0;
  let previousTime = 0;
  const canTrack = () => finePointer.matches && !reduce.matches && root.dataset.input !== 'keyboard' && !root.classList.contains('reading') && !document.hidden;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function tick(time) {
    frame = 0;
    if (!canTrack()) { resetImage(); return; }
    const dt = Math.min((time - (previousTime || time - 16)) / 1000, 1 / 60);
    previousTime = time;
    let settled = true;
    for (let index = 0; index < position.length; index++) {
      const acceleration = (target[index] - position[index]) * 100 - velocity[index] * 10;
      velocity[index] += acceleration * dt;
      position[index] += velocity[index] * dt;
      if (Math.abs(target[index] - position[index]) > 0.02 || Math.abs(velocity[index]) > 0.02) settled = false;
    }
    visual.style.transform = 'perspective(1400px) rotateX(' + position[0].toFixed(3) + 'deg) rotateY(' + position[1].toFixed(3) + 'deg)';
    image.style.transform = 'translate3d(' + position[2].toFixed(3) + 'px,' + position[3].toFixed(3) + 'px,0) scale(1.10)';
    if (!settled) frame = requestAnimationFrame(tick);
    else previousTime = 0;
  }
  function schedule() { if (!frame && canTrack()) frame = requestAnimationFrame(tick); }
  function resetImage() {
    cancelAnimationFrame(frame);
    frame = 0;
    previousTime = 0;
    pointerY = 0;
    scrollOffset = 0;
    target.fill(0); position.fill(0); velocity.fill(0);
    visual.style.removeProperty('transform');
    image.style.removeProperty('transform');
  }
  visual.addEventListener('pointermove', event => {
    if (!canTrack()) return;
    const rect = visual.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    target[0] = -y * 4;
    target[1] = x * 4;
    target[2] = -x * 18;
    pointerY = -y * 18;
    target[3] = pointerY + scrollOffset;
    schedule();
  });
  visual.addEventListener('pointerleave', () => {
    target[0] = 0; target[1] = 0; target[2] = 0; pointerY = 0;
    target[3] = scrollOffset;
    schedule();
  });
  window.addEventListener('scroll', () => {
    if (!canTrack()) return;
    const rect = visual.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > innerHeight) return;
    scrollOffset = clamp(-rect.top * 0.07, -22, 22);
    target[3] = pointerY + scrollOffset;
    schedule();
  }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) resetImage(); });
  document.addEventListener('keydown', () => resetImage());
  reduce.addEventListener('change', () => { if (reduce.matches) { stopDecorativeMotion(); resetImage(); } });
  finePointer.addEventListener('change', () => { if (!finePointer.matches) { resetImage(); preview.classList.remove('is-visible'); } });
  wide.addEventListener('change', () => { if (!wide.matches) preview.classList.remove('is-visible'); });

  // A visual preview beside the writing list. It never intercepts a click.
  const previewImage = preview.querySelector('img');
  const previewCategory = preview.querySelector('.preview-category');
  const previewAssets = { trail: './assets/mountain.jpg', memory: './assets/aevum.png', waypoint: './favicon.svg' };
  document.querySelectorAll('.note-row').forEach(row => {
    row.addEventListener('pointerenter', () => {
      if (!finePointer.matches || !wide.matches || reduce.matches || root.dataset.input === 'keyboard' || root.classList.contains('reading')) return;
      const key = row.getAttribute('href').slice(6);
      const rect = row.getBoundingClientRect();
      const header = document.querySelector('.site-header').getBoundingClientRect();
      previewImage.src = previewAssets[key];
      preview.dataset.note = key;
      previewCategory.textContent = row.querySelector('.note-category').textContent;
      preview.style.left = Math.max(20, rect.right - 280) + 'px';
      preview.style.top = clamp(rect.top - 60, header.bottom + 18, innerHeight - 260) + 'px';
      preview.classList.add('is-visible');
    });
    row.addEventListener('pointerleave', () => preview.classList.remove('is-visible'));
    row.addEventListener('click', () => preview.classList.remove('is-visible'));
  });
  window.addEventListener('scroll', () => preview.classList.remove('is-visible'), { passive: true });

  document.querySelectorAll('.spotlight-surface').forEach(surface => {
    surface.addEventListener('pointermove', event => {
      if (!finePointer.matches || reduce.matches) return;
      const rect = surface.getBoundingClientRect();
      surface.style.setProperty('--spotlight-x', (event.clientX - rect.left) + 'px');
      surface.style.setProperty('--spotlight-y', (event.clientY - rect.top) + 'px');
    });
  });
}
