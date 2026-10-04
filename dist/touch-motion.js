// A passive touch trail. Only this small transparent surface is redrawn; the
// document, its images, native scrolling and touch targets stay in place.
let controller = null;
const LIFE = 1.2, SAMPLE_INTERVAL = 1 / 60, MAX_POINTS = Math.ceil(LIFE / SAMPLE_INTERVAL) + 1;
const SPRITE_EDGE = 96, SPRITE_PIXELS = 2 * SPRITE_EDGE * SPRITE_EDGE;
const MAX_PIXELS = 640000, MAX_DIRTY_PIXELS = 280000, MAX_DPR = 1.25;
const ENVELOPE = 56; // Largest radius, bounded drift and an antialiasing margin.
const protectedSelector = '.preview-device,.preview-display,.preview-screen,.reader-dialog,dialog,.site-header,.header-controls,.race-archive-controls,a[href],button,input,textarea,select,summary,[role="button"],[role="tab"],[role="link"],[role="slider"],[contenteditable]:not([contenteditable="false"])';
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const union = (a, b) => !a ? b : !b ? a : ({
  left: Math.min(a.left, b.left), top: Math.min(a.top, b.top),
  right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom)
});

export function initTouchMotion() {
  if (controller) return controller;
  const root = document.documentElement, reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const viewport = window.visualViewport, listeners = [];
  let canvas = null, context = null, sprites = [], points = [], frame = 0, lastBirth = -Infinity;
  let width = 0, height = 0, ratio = 1, lastDirty = null;
  let gesture = null, pending = null, touchCount = 0, multiple = false;
  let destroyed = false, failed = false, active = true, keyboard = root.dataset.input === 'keyboard';
  let modal = root.classList.contains('reading') || Boolean(document.querySelector('dialog[open]'));
  let protectedNodes = [], protectionsDirty = true;
  const selected = () => getSelection()?.isCollapsed === false;
  const zoomed = () => viewport && Math.abs(viewport.scale - 1) > .02;
  const allowed = () => !destroyed && !failed && active && !document.hidden && !reduce.matches && !keyboard &&
    root.dataset.input !== 'keyboard' && !modal && !selected() && !zoomed();

  function listen(target, name, handler, options) {
    target.addEventListener(name, handler, options);
    listeners.push(() => target.removeEventListener(name, handler, options));
  }
  function bounded(rect) {
    if (!rect) return null;
    const area = { left: clamp(rect.left, 0, width), top: clamp(rect.top, 0, height),
      right: clamp(rect.right, 0, width), bottom: clamp(rect.bottom, 0, height) };
    return area.right > area.left && area.bottom > area.top ? area : null;
  }
  function erase(rect) {
    const area = bounded(rect);
    if (!context || !area) return;
    // Clear whole backing pixels, including the previous frame's soft edge.
    const x = Math.floor(area.left * ratio), y = Math.floor(area.top * ratio);
    const right = Math.ceil(area.right * ratio), bottom = Math.ceil(area.bottom * ratio);
    context.clearRect(x / ratio, y / ratio, (right - x) / ratio, (bottom - y) / ratio);
  }
  function stop() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }
  function resetGesture() { gesture = pending = null; touchCount = 0; multiple = false; }
  function clear() {
    stop(); erase(lastDirty); lastDirty = null; points = []; pending = null;
    if (canvas) canvas.hidden = true;
  }
  function halt() { clear(); resetGesture(); }
  function sprite(light) {
    const surface = document.createElement('canvas'); surface.width = surface.height = SPRITE_EDGE;
    const paint = surface.getContext('2d');
    if (!paint) throw new Error('Touch fog sprite unavailable');
    const color = light ? '76,86,78' : '222,227,220';
    for (const [x, y, radius, opacity] of [[46,49,43,.55],[34,40,27,.28],[60,43,29,.3],[53,62,25,.2]]) {
      const gradient = paint.createRadialGradient(x,y,0,x,y,radius);
      gradient.addColorStop(0, 'rgba(' + color + ',' + opacity + ')');
      gradient.addColorStop(.45, 'rgba(' + color + ',' + opacity * .5 + ')');
      gradient.addColorStop(1, 'rgba(' + color + ',0)');
      paint.fillStyle = gradient; paint.fillRect(0,0,SPRITE_EDGE,SPRITE_EDGE);
    }
    return surface;
  }
  function resize(force = false) {
    if (!canvas) return;
    const nextWidth = Math.max(1, innerWidth);
    // Screen height reserves space for browser chrome collapsing. A normal
    // address-bar resize changes visible space, without replacing this store.
    const nextHeight = Math.max(1, innerHeight, window.screen?.height || 0);
    if (!force && Math.abs(nextWidth - width) < 1 && nextHeight <= height) return;
    if (width) halt();
    width = nextWidth; height = nextHeight;
    ratio = Math.min(devicePixelRatio || 1, MAX_DPR, Math.sqrt((MAX_PIXELS - SPRITE_PIXELS) / (width * height)));
    canvas.width = Math.max(1, Math.floor(width * ratio)); canvas.height = Math.max(1, Math.floor(height * ratio));
    canvas.style.width = width + 'px'; canvas.style.height = height + 'px';
    context.setTransform(ratio,0,0,ratio,0,0);
  }
  function ensureCanvas() {
    if (canvas) return true;
    try {
      canvas = document.createElement('canvas'); canvas.className = 'touch-motion-canvas';
      canvas.setAttribute('aria-hidden','true'); canvas.hidden = true;
      context = canvas.getContext('2d', { alpha: true, desynchronized: true });
      if (!context) throw new Error('Touch fog canvas unavailable');
      sprites = [sprite(false), sprite(true)];
      document.body.append(canvas); resize(); return true;
    } catch (error) {
      failed = true; halt(); canvas?.remove(); canvas = context = null; sprites = [];
      console.warn('Touch fog is unavailable; native scrolling remains available.', error?.message || error);
      return false;
    }
  }
  function protectionRects(dirty) {
    if (protectionsDirty) { protectedNodes = [...document.querySelectorAll(protectedSelector)]; protectionsDirty = false; }
    const result = [];
    for (const node of protectedNodes) {
      if (!node.isConnected || node.closest('[hidden]')) continue;
      // Wrapped inline links protect their actual fragments, without blanking
      // the reading space between lines or beside a control.
      for (const rect of node.getClientRects()) {
        if (rect.width <= 0 || rect.height <= 0 || rect.right <= dirty.left || rect.left >= dirty.right || rect.bottom <= dirty.top || rect.top >= dirty.bottom) continue;
        result.push({ left: Math.max(rect.left,dirty.left), top: Math.max(rect.top,dirty.top),
          right: Math.min(rect.right,dirty.right), bottom: Math.min(rect.bottom,dirty.bottom) });
      }
    }
    return result;
  }
  function inject(move, time) {
    if (!gesture || move.identifier !== gesture.identifier || touchCount !== 1 || multiple || !gesture.moved) return;
    const target = document.elementFromPoint(move.x,move.y);
    if (!target || target.closest(protectedSelector)) { gesture.last = move; return; }
    if (gesture.last && Math.hypot(move.x-gesture.last.x,move.y-gesture.last.y) < .5) return;
    if (time - lastBirth < SAMPLE_INTERVAL || points.length >= MAX_POINTS) return;
    const delta = gesture.last ? Math.max(.008, move.time - gesture.last.time) : .016;
    const vx = gesture.last ? clamp((move.x - gesture.last.x) / delta,-900,900) : 0;
    const vy = gesture.last ? clamp((move.y - gesture.last.y) / delta,-900,900) : 0;
    const point = { x: move.x, y: move.y, vx, vy, t: time, seed: time * 7.3 + move.x * .021 };
    let envelope = lastDirty;
    for (const live of [...points,point]) envelope = union(envelope,bounded({
      left: live.x - ENVELOPE, top: live.y - ENVELOPE, right: live.x + ENVELOPE, bottom: live.y + ENVELOPE
    }));
    if (!envelope || (envelope.right - envelope.left) * (envelope.bottom - envelope.top) * ratio * ratio > MAX_DIRTY_PIXELS) return;
    points.push(point); lastBirth = time; gesture.last = move;
  }
  function schedule() {
    if (!frame && allowed() && (points.length || pending)) frame = requestAnimationFrame(tick);
  }
  function tick(now) {
    frame = 0;
    if (!allowed()) { halt(); return; }
    const time = now / 1000;
    points = points.filter(point => time - point.t < LIFE);
    const move = pending; pending = null;
    if (move && ensureCanvas()) inject(move,time);
    if (!points.length) { clear(); return; }
    const drawing = points.map(point => {
      const age = time - point.t, radius = 20 + age * 18;
      const x = point.x + point.vx * age * .003 + Math.sin(point.seed + age * 2) * age * 5;
      const y = point.y + point.vy * age * .003 + Math.cos(point.seed + age * 1.8) * age * 3 - age * 4;
      return { point, age, radius, x, y };
    });
    let nextDirty = null;
    for (const {x,y,radius} of drawing) nextDirty = union(nextDirty,bounded({ left:x-radius-2,top:y-radius-2,right:x+radius+2,bottom:y+radius+2 }));
    const dirty = union(lastDirty,nextDirty);
    if (!dirty) { clear(); return; }
    // Read all moving protection geometry before painting, then erase only the
    // union of the last two frames. Old clouds outside protections keep fading.
    const exclusions = protectionRects(dirty);
    erase(dirty); canvas.hidden = false;
    const light = root.dataset.theme === 'light', material = sprites[light ? 1 : 0];
    const strength = light ? .055 : root.dataset.theme === 'gray' ? .075 : .105;
    for (const {point,age,radius,x,y} of drawing) {
      context.save(); context.translate(x,y); context.rotate(Math.sin(point.seed) * .5 + age * .15);
      context.globalAlpha = strength * (1-age/LIFE) ** 1.5 * (20/radius) ** .65;
      context.drawImage(material,-radius,-radius,radius*2,radius*2); context.restore();
    }
    exclusions.forEach(erase); lastDirty = nextDirty;
    schedule();
  }
  function updateGate() {
    modal = root.classList.contains('reading') || Boolean(document.querySelector('dialog[open]'));
    if (!allowed()) halt();
  }
  function touchStart(event) {
    touchCount = event.touches.length;
    if (touchCount > 1) { multiple = true; gesture = pending = null; clear(); return; }
    if (multiple || touchCount !== 1) return;
    keyboard = false;
    if (event.isTrusted) root.dataset.input = 'pointer';
    if (!allowed()) { halt(); return; }
    const touch = event.touches[0], time = performance.now() / 1000;
    gesture = { identifier:touch.identifier, x:touch.clientX, y:touch.clientY, moved:false,
      last:{identifier:touch.identifier,x:touch.clientX,y:touch.clientY,time} };
  }
  function touchMove(event) {
    touchCount = event.touches.length;
    if (touchCount > 1) { multiple = true; gesture = pending = null; clear(); return; }
    if (multiple || !gesture || touchCount !== 1) return;
    if (!allowed()) { halt(); return; }
    const touch = [...event.touches].find(touch => touch.identifier === gesture.identifier);
    if (!touch) return;
    if (Math.hypot(touch.clientX - gesture.x,touch.clientY - gesture.y) <= 8 && !gesture.moved) return;
    gesture.moved = true;
    pending = { identifier:touch.identifier,x:touch.clientX,y:touch.clientY,time:performance.now()/1000 };
    schedule();
  }
  function touchEnd(event) {
    touchCount = event.touches.length;
    if (!touchCount) { gesture = pending = null; multiple = false; }
    else if (gesture && ![...event.touches].some(touch => touch.identifier === gesture.identifier)) gesture = pending = null;
    schedule();
  }
  const passive = { passive:true };
  listen(document,'touchstart',touchStart,passive); listen(document,'touchmove',touchMove,passive);
  listen(document,'touchend',touchEnd,passive); listen(document,'touchcancel',touchEnd,passive);
  listen(document,'keydown',()=>{keyboard=true;halt();});
  listen(document,'selectionchange',()=>{if(selected())halt();});
  listen(document,'visibilitychange',updateGate);
  listen(document,'waypoint-reader',updateGate); listen(document,'toggle',updateGate,true); listen(document,'close',updateGate,true);
  listen(window,'blur',()=>{active=false;halt();}); listen(window,'focus',()=>{active=true;updateGate();});
  listen(window,'resize',()=>resize()); listen(window,'orientationchange',()=>resize(true));
  if (viewport) { listen(viewport,'resize',updateGate,passive); listen(viewport,'scroll',updateGate,passive); }
  listen(reduce,'change',updateGate);
  const rootObserver = new MutationObserver(()=>{updateGate();});
  rootObserver.observe(root,{attributes:true,attributeFilter:['class','data-input','data-theme']});
  const contentObserver = new MutationObserver(records=>{
    if (destroyed || !records.some(record=>record.target!==canvas)) return;
    protectionsDirty = true; updateGate();
  });
  contentObserver.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden','open','role','href','contenteditable']});
  function destroy() {
    if (destroyed) return;
    halt(); destroyed = true; listeners.forEach(remove=>remove());
    rootObserver.disconnect(); contentObserver.disconnect(); canvas?.remove();
    canvas = context = null; sprites = []; protectedNodes = []; controller = null;
  }
  controller = { destroy };
  return controller;
}
