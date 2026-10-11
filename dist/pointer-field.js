// One transparent WebGL renderer for drifting, diffusing fog.
// Original images, alt text, layout and native App hotspots remain in the DOM.
let instance = null;
const MAX_FRAME_PIXELS = 1600000;
const MAX_FOG_PIXELS = 180000, MAX_FOG_EDGE = 640;
const TRAIL_LIFE = 2.3;
const TRAIL_SAMPLE_INTERVAL = 1 / 60;
const MAX_POINTS = Math.ceil(TRAIL_LIFE / TRAIL_SAMPLE_INTERVAL) + 1;
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

const vertex = `attribute vec2 aPosition;attribute vec3 aData;uniform mediump vec2 uView;
varying vec3 vData;void main(){vec2 p=aPosition/uView*2.-1.;gl_Position=vec4(p.x,-p.y,0.,1.);vData=aData;}`;
// A cloud has a soft density field, warped by coherent noise. Its birth velocity
// drives drift and curl; its radius expands while its density dissipates.
const fogFragment = `precision highp float;varying vec3 vData;uniform float uTime;uniform float uLight;
uniform mediump vec2 uView;uniform vec2 uResolution;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){float n=0.;n+=noise(p)*.54;p=p*2.03+13.1;n+=noise(p)*.27;p=p*2.01+7.7;n+=noise(p)*.135;return n;}
void main(){vec2 world=gl_FragCoord.xy/uResolution*uView;vec2 p=vData.xy;
vec2 drift=vec2(fbm(world*.012+vec2(uTime*.15,7.)),fbm(world*.012+vec2(17.,-uTime*.13)))-.5;
p+=drift*.55;float haze=fbm(p*3.7+world*.004+vec2(uTime*.10,-uTime*.06));
float density=exp(-dot(p,p)*3.4)*(.34+.9*smoothstep(.19,.78,haze));
float alpha=density*vData.z*.105;vec3 silver=mix(vec3(.62+.32*haze),vec3(.12+.2*haze),uLight);
gl_FragColor=vec4(silver*alpha,alpha);}`;
const fogCompositeFragment = `precision mediump float;uniform vec2 uResolution;uniform vec2 uTexel;
uniform sampler2D uTexture;uniform float uLight;
void main(){vec2 uv=gl_FragCoord.xy/uResolution;vec4 cloud=texture2D(uTexture,uv)*.28;
cloud+=(texture2D(uTexture,uv+vec2(uTexel.x,0.))+texture2D(uTexture,uv-vec2(uTexel.x,0.))+
texture2D(uTexture,uv+vec2(0.,uTexel.y))+texture2D(uTexture,uv-vec2(0.,uTexel.y)))*.14;
cloud+=(texture2D(uTexture,uv+uTexel)+texture2D(uTexture,uv-uTexel)+
texture2D(uTexture,uv+vec2(uTexel.x,-uTexel.y))+texture2D(uTexture,uv+vec2(-uTexel.x,uTexel.y)))*.04;
float alpha=mix(min(cloud.a,.34),min(cloud.a*.9,.21),uLight);
gl_FragColor=vec4(cloud.rgb/max(cloud.a,.00001)*alpha,alpha);}`;

export function initPointerField() {
  if (instance) return instance;
  const root = document.documentElement, fine = matchMedia('(hover: hover) and (pointer: fine)');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const exclusions = new Map(), listeners = [];
  let canvas = null, gl = null, fogProgram = null, fogCompositeProgram = null, exclusionProgram = null, buffer = null;
  let fog = null;
  let destroyed = false, failed = false, frame = 0, width = innerWidth, height = innerHeight;
  let focused = true, keyboard = root.dataset.input === 'keyboard';
  let modal = root.classList.contains('reading') || Boolean(document.querySelector('dialog[open]'));
  let refreshQueued = false, points = [], lastMove = 0, lastPoint = 0;
  let pointer = { x: -1000, y: -1000, vx: 0, vy: 0 };
  const epoch = performance.now();
  const nowSeconds = () => (performance.now() - epoch) / 1000;
  const allowed = () => !destroyed && !failed && fine.matches && !reduce.matches && focused && !document.hidden && !keyboard && !modal;
  const on = (target, name, fn, options) => { target.addEventListener(name, fn, options); listeners.push(() => target.removeEventListener(name, fn, options)); };
  function stop() { if (frame) cancelAnimationFrame(frame); frame = 0; }
  function releaseSampling() {
    lastMove = lastPoint = 0;
    pointer = { x: -1000, y: -1000, vx: 0, vy: 0 };
  }
  function clear() {
    stop(); points = []; releaseSampling();
    if (gl && !gl.isContextLost()) {
      wipeFog(); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    }
    if (canvas && !canvas.hidden) canvas.hidden = true;
  }
  function fail(error) { failed = true; clear(); console.warn('Pointer fog effect is unavailable; page content remains visible.', error?.message || error); }
  function compile(type, source) {
    const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { const error = gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw new Error(error); }
    return shader;
  }
  function program(fragment) {
    const vert = compile(gl.VERTEX_SHADER, vertex), frag = compile(gl.FRAGMENT_SHADER, fragment);
    const handle = gl.createProgram(); gl.attachShader(handle, vert); gl.attachShader(handle, frag); gl.linkProgram(handle);
    gl.deleteShader(vert); gl.deleteShader(frag);
    if (!gl.getProgramParameter(handle, gl.LINK_STATUS)) { const error = gl.getProgramInfoLog(handle); gl.deleteProgram(handle); throw new Error(error); }
    const uniforms = {};
    for (const name of ['uView','uTime','uLight','uResolution','uTexel','uTexture']) uniforms[name] = gl.getUniformLocation(handle, name);
    return { handle, uniforms, position: gl.getAttribLocation(handle, 'aPosition'), data: gl.getAttribLocation(handle, 'aData') };
  }
  function ensureRenderer() {
    if (gl && fogProgram) return true;
    if (failed || !allowed()) return false;
    try {
      if (!canvas) {
        canvas = document.createElement('canvas'); canvas.className = 'pointer-field-canvas';
        canvas.setAttribute('aria-hidden', 'true'); canvas.hidden = true; document.body.append(canvas);
        on(canvas, 'webglcontextlost', event => { event.preventDefault(); failed = true; clear(); fog = null; });
        on(canvas, 'webglcontextrestored', () => {
          fogProgram = fogCompositeProgram = exclusionProgram = buffer = gl = null; fog = null; failed = false;
        });
      }
      gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
      if (!gl) throw new Error('WebGL unavailable');
      fogProgram = program(fogFragment); fogCompositeProgram = program(fogCompositeFragment);
      // Overwrite the transformed preview footprint with transparency after all
      // effects. Its real image, text and native hotspots stay entirely clear.
      exclusionProgram = program('precision mediump float;varying vec3 vData;void main(){if(vData.z<=0.)discard;gl_FragColor=vec4(0.);}');
      buffer = gl.createBuffer();
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); resize(); return true;
    } catch (error) { fail(error); return false; }
  }
  function resize() {
    width = Math.max(1, innerWidth); height = Math.max(1, innerHeight);
    if (!canvas || !gl) return;
    const ratio = Math.min(devicePixelRatio || 1, 1.25, Math.sqrt(MAX_FRAME_PIXELS / (width * height)));
    canvas.width = Math.max(1, Math.floor(width * ratio)); canvas.height = Math.max(1, Math.floor(height * ratio));
    gl.viewport(0, 0, canvas.width, canvas.height); allocateFog();
  }
  function releaseOffscreen() {
    for (const state of exclusions.values()) if (!state.visible && state.guide) { state.guide.remove(); state.guide = null; }
  }
  const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
    for (const entry of entries) {
      const state = exclusions.get(entry.target); if (!state) continue;
      state.visible = entry.isIntersecting && entry.intersectionRatio > 0;
    }
    releaseOffscreen();
  }, { threshold: 0.001 });
  function refresh() {
    if (destroyed) return;
    for (const [node,state] of exclusions) if (!node.isConnected) { observer?.unobserve(node); state.guide?.remove(); exclusions.delete(node); }
    for (const node of document.querySelectorAll('.preview-device,.preview-display')) if (!exclusions.has(node)) {
      exclusions.set(node,{node,visible:!observer,guide:null}); observer?.observe(node);
    }
    releaseOffscreen();
  }
  function queueRefresh() {
    if (refreshQueued || destroyed) return;
    refreshQueued = true; queueMicrotask(() => { refreshQueued = false; refresh(); });
  }
  function ensureGuide(state) {
    const node = state.node, css = getComputedStyle(node);
    const fixed = !node.offsetParent && css.position === 'fixed';
    const host = node.offsetParent || (fixed ? document.body : null);
    if (!(host instanceof HTMLElement)) return null;
    if (!state.guide || state.guide.parentElement !== host) {
      state.guide?.remove();
      const guide = document.createElement('span'); guide.className = 'pointer-image-guide'; guide.setAttribute('aria-hidden', 'true');
      for (const [x,y] of [[0,0],[100,0],[100,100],[0,100]]) {
        const marker = document.createElement('span'); marker.style.left = x + '%'; marker.style.top = y + '%'; guide.append(marker);
      }
      host.append(guide); state.guide = guide;
    }
    const guide = state.guide;
    Object.assign(guide.style, { position: fixed ? 'fixed' : 'absolute', left: node.offsetLeft + 'px', top: node.offsetTop + 'px', width: node.offsetWidth + 'px', height: node.offsetHeight + 'px', translate: css.translate, rotate: css.rotate, scale: css.scale, transform: css.transform, transformOrigin: css.transformOrigin });
    return [...guide.children].map(marker => { const r = marker.getBoundingClientRect(); return [r.left,r.top]; });
  }
  function use(prog, data) {
    gl.useProgram(prog.handle); gl.bindBuffer(gl.ARRAY_BUFFER,buffer); gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(prog.position);gl.vertexAttribPointer(prog.position,2,gl.FLOAT,false,20,0);
    if(prog.data>=0){gl.enableVertexAttribArray(prog.data);gl.vertexAttribPointer(prog.data,3,gl.FLOAT,false,20,8);}
    gl.uniform2f(prog.uniforms.uView,width,height);gl.uniform1f(prog.uniforms.uTime,nowSeconds());
    gl.uniform1f(prog.uniforms.uLight,root.dataset.theme==='light'?1:0);
  }
  function releaseFog() {
    if(!fog)return;
    if(gl&&!gl.isContextLost()){gl.deleteFramebuffer(fog.framebuffer);gl.deleteTexture(fog.texture);}
    fog=null;
  }
  function wipeFog() {
    if(!fog||!gl||gl.isContextLost())return;
    gl.bindFramebuffer(gl.FRAMEBUFFER,fog.framebuffer);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
  }
  function allocateFog() {
    releaseFog();
    const scale=Math.min(1,MAX_FOG_EDGE/Math.max(width,height),Math.sqrt(MAX_FOG_PIXELS/(width*height)));
    const w=Math.max(1,Math.floor(width*scale)),h=Math.max(1,Math.floor(height*scale));
    const texture=gl.createTexture(),framebuffer=gl.createFramebuffer();fog={texture,framebuffer,width:w,height:h};
    gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Fog framebuffer unavailable');
    wipeFog();gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,canvas.width,canvas.height);
  }
  function drawFog(time) {
    if(!fog||!points.length)return;
    const data=[];
    for(const point of points) {
      const age=time-point.t,life=Math.pow(clamp(1-age/TRAIL_LIFE,0,1),1.15);
      const birth=46+Math.min(52,point.speed*.026),radius=birth+age*43;
      const seed=point.t*8.1+point.x*.013,curl=age*(9+Math.min(23,point.speed*.014));
      const x=point.x+point.vx*age*.025+Math.cos(seed+age*1.6)*curl;
      const y=point.y+point.vy*age*.025+Math.sin(seed+age*1.6)*curl-age*8;
      const angle=Math.atan2(point.vy,point.vx)+Math.sin(seed)*.55+age*.3,c=Math.cos(angle),s=Math.sin(angle);
      const density=life*Math.pow(birth/radius,.7)*point.pressure;
      for(const [u,v] of [[-1,-1],[1,-1],[1,1],[-1,-1],[1,1],[-1,1]]) {
        const localX=u*radius,localY=v*radius*.76;
        data.push(x+c*localX-s*localY,y+s*localX+c*localY,u,v,density);
      }
    }
    wipeFog();gl.viewport(0,0,fog.width,fog.height);
    use(fogProgram,new Float32Array(data));gl.uniform2f(fogProgram.uniforms.uResolution,fog.width,fog.height);
    gl.drawArrays(gl.TRIANGLES,0,data.length/5);
    // Only the fog texture is softened. The webpage and original images stay crisp.
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,canvas.width,canvas.height);
    const quad=new Float32Array([0,0,0,0,1,width,0,1,0,1,width,height,1,1,1,0,0,0,0,1,width,height,1,1,1,0,height,0,1,1]);
    use(fogCompositeProgram,quad);const un=fogCompositeProgram.uniforms;
    gl.uniform2f(un.uResolution,canvas.width,canvas.height);gl.uniform2f(un.uTexel,1/fog.width,1/fog.height);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,fog.texture);gl.uniform1i(un.uTexture,0);
    gl.drawArrays(gl.TRIANGLES,0,6);
  }
  function projected(state) {
    const quad=ensureGuide(state);if(!quad)return;
    const [a,b,c,d]=quad,v=[c[0]-a[0],c[1]-a[1]],u=[d[0]-b[0],d[1]-b[1]],r=[b[0]-a[0],b[1]-a[1]];
    const cross=(p,q)=>p[0]*q[1]-p[1]*q[0],den=cross(v,u);if(Math.abs(den)<.01)return;
    const s=cross(r,u)/den,t=cross(r,v)/den;
    if(s<=0||s>=1||t<=0||t>=1)return;
    const qs=[1/(1-s),1/(1-t),1/s,1/t],uvs=[[0,0],[1,0],[1,1],[0,1]],data=[];
    for(const index of [0,1,2,0,2,3])data.push(...quad[index],uvs[index][0]*qs[index],uvs[index][1]*qs[index],qs[index]);
    return new Float32Array(data);
  }
  function clearPreview() {
    gl.disable(gl.BLEND);
    for(const state of exclusions.values()) {
      if(!state.node.isConnected||state.node.closest('[hidden]'))continue;
      // Geometry is authoritative even before IntersectionObserver catches up
      // after a fast scroll, so no transient trail enters the readable screen.
      const rect=state.node.getBoundingClientRect();
      if(rect.right<0||rect.left>width||rect.bottom<0||rect.top>height)continue;
      const projection=projected(state);if(!projection)continue;
      use(exclusionProgram,projection);gl.drawArrays(gl.TRIANGLES,0,6);
    }
    gl.enable(gl.BLEND);
  }
  function schedule() {if(!frame&&allowed()&&points.length)frame=requestAnimationFrame(tick);}
  function tick(now) {
    frame=0;if(!allowed()){clear();return;}
    const time=(now-epoch)/1000;
    points=points.filter(point=>time-point.t<TRAIL_LIFE);
    if(!points.length){clear();return;}
    if(!ensureRenderer())return;
    try {
      if(canvas.hidden)canvas.hidden=false;gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
      drawFog(time);clearPreview();schedule();
    }catch(error){fail(error);}
  }
  function updateGate() {
    modal=root.classList.contains('reading')||Boolean(document.querySelector('dialog[open]'));
    if(!allowed())clear();
  }
  on(document,'pointermove',event=>{
    if(event.pointerType!=='mouse'||!fine.matches)return;
    keyboard=false;if(!allowed())return;
    // The readable screen emits no effects. Existing clouds outside it keep
    // their own lifetimes; clearPreview still removes its final painted pixels.
    if(event.target instanceof Element&&event.target.closest('.preview-device,.preview-display')){releaseSampling();return;}
    const time=nowSeconds(),dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;
    const continuous=lastMove>0&&time-lastMove<=.25;
    if(continuous&&Math.hypot(dx,dy)<2&&time-lastMove<.08)return;
    const dt=Math.max(.008,time-lastMove),speed=continuous?Math.min(2000,Math.hypot(dx,dy)/dt):100;
    pointer={x:event.clientX,y:event.clientY,vx:continuous?clamp(dx/dt,-1800,1800):0,vy:continuous?clamp(dy/dt,-1800,1800):0};
    lastMove=time;const pressure=event.pressure>0?clamp(.65+event.pressure,.65,1.3):1;
    // Sampling and capacity share a lifetime budget. A busy mouse cannot evict
    // a living cloud; every point retains its birth velocity until it expires.
    points=points.filter(point=>time-point.t<TRAIL_LIFE);
    if(time-lastPoint>=TRAIL_SAMPLE_INTERVAL&&points.length<MAX_POINTS){
      points.push({x:pointer.x,y:pointer.y,vx:pointer.vx,vy:pointer.vy,t:time,speed,pressure});lastPoint=time;
    }
    schedule();
  },{passive:true});
  on(document,'pointerleave',releaseSampling);on(window,'blur',()=>{focused=false;clear();});on(window,'focus',()=>{focused=true;updateGate();});
  on(document,'keydown',()=>{keyboard=true;clear();});on(document,'visibilitychange',updateGate);
  on(document,'waypoint-reader',updateGate);on(document,'toggle',updateGate,true);on(document,'close',updateGate,true);
  // Clouds keep drifting through scrolls. Fresh pointer input starts with a
  // new velocity sample after the page has moved.
  on(window,'scroll',()=>{releaseSampling();releaseOffscreen();},{passive:true});on(window,'resize',()=>{resize();clear();},{passive:true});
  on(reduce,'change',updateGate);on(fine,'change',updateGate);on(document,'load',queueRefresh,true);
  on(document,'journal-ready',queueRefresh);on(document,'journal-loading',queueRefresh);
  const rootObserver=new MutationObserver(records=>{
    if(records.some(record=>record.attributeName==='data-input'))keyboard=root.dataset.input==='keyboard';
    if(records.some(record=>['data-language','data-theme'].includes(record.attributeName))){clear();queueRefresh();}
    updateGate();
  });
  rootObserver.observe(root,{attributes:true,attributeFilter:['class','data-input','data-language','data-theme']});
  const bodyObserver=new MutationObserver(records=>{
    const relevant=records.filter(record=>record.target!==canvas&&!record.target.closest?.('.pointer-image-guide'));
    if(!relevant.length)return;
    // Lazy-loaded content can change while scrolling. Recheck motion gates
    // without discarding clouds just because a loading or view flag changed.
    if(relevant.some(record=>record.type==='attributes'))updateGate();
    queueRefresh();
  });
  bodyObserver.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','data-app','data-view','data-locale','aria-busy','open']});
  function destroy() {
    if(destroyed)return;clear();destroyed=true;observer?.disconnect();rootObserver.disconnect();bodyObserver.disconnect();listeners.forEach(remove=>remove());
    for(const state of exclusions.values())state.guide?.remove();
    if(gl&&!gl.isContextLost()){releaseFog();if(fogProgram)gl.deleteProgram(fogProgram.handle);if(fogCompositeProgram)gl.deleteProgram(fogCompositeProgram.handle);if(exclusionProgram)gl.deleteProgram(exclusionProgram.handle);if(buffer)gl.deleteBuffer(buffer);gl.getExtension('WEBGL_lose_context')?.loseContext();}
    canvas?.remove();canvas=gl=null;exclusions.clear();instance=null;
  }
  instance={refresh,destroy};refresh();return instance;
}
