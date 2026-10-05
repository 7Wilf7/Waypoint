import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {copy} from '../dist/i18n.js';
import {ambientTracks} from '../dist/ambient-tracks.js';

const source=(await readFile(new URL('../dist/ambient-audio.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/\bexport /g,'').replaceAll('import.meta.url',"'https://fixture.test/ambient-audio.js'");
function fixture({off=false,blocked=false}={}) {
  class Target {
    listeners=new Map();dataset={};attributes=new Map();hidden=true;
    addEventListener(name,handler){if(!this.listeners.has(name))this.listeners.set(name,new Set());this.listeners.get(name).add(handler);}
    removeEventListener(name,handler){this.listeners.get(name)?.delete(handler);}
    dispatch(name,extra={}){for(const handler of this.listeners.get(name)||[])handler({type:name,target:this,...extra});}
    setAttribute(name,value){this.attributes.set(name,value);}
    removeAttribute(name){this.attributes.delete(name);if(name==='src')this.src='';}
    closest(selector){return selector==='.sound-toggle'&&buttons.includes(this)?this:null;}
  }
  const buttons=[new Target(),new Target()],credits=[new Target(),new Target()],audio=new Target(),document=new Target(),root={dataset:{language:'zh'}};
  const operations={play:0,pause:0,load:0,source:0};let audioSource='',observed;
  Object.defineProperty(audio,'src',{get:()=>audioSource,set:value=>{audioSource=value;operations.source++;}});
  audio.paused=true;audio.currentTime=17;
  audio.play=async()=>{operations.play++;if(blocked){const error=new Error('gesture required');error.name='NotAllowedError';throw error;}audio.paused=false;audio.dispatch('playing');};
  audio.pause=()=>{operations.pause++;audio.paused=true;audio.dispatch('pause');};
  audio.load=()=>{operations.load++;};
  document.hidden=false;document.documentElement=root;
  document.querySelector=selector=>selector==='#ambient-audio'?audio:null;
  document.querySelectorAll=selector=>selector==='.sound-toggle'?buttons:selector==='.footer-music'?credits:[];
  const storage=new Map(off?[['waypoint-sound','off']]:[]);
  const context={document,URL,copy,ambientTracks,localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},Math,
    MutationObserver:class{constructor(handler){this.handler=handler;}observe(_,options){observed={handler:this.handler,options};}disconnect(){}}};
  const init=runInNewContext(source+'\ninitAmbientAudio;',context);
  return {init,audio,buttons,credits,document,root,operations,storage,unblock(){blocked=false;},language(value){root.dataset.language=value;observed.handler([{attributeName:'data-language'}]);}};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('reader and archive navigation retain one track, playback position, and both accessible controls',async()=>{
  const f=fixture();const controller=f.init();await settle();
  assert.equal(f.audio.paused,false);const source=f.audio.src;
  const before={...f.operations};
  f.document.dispatch('waypoint-reader');f.root.dataset.view='races';f.document.dispatch('waypoint-route');f.root.dataset.view='home';f.document.dispatch('waypoint-reader');
  f.language('en');assert.equal(f.init(),controller);
  assert.equal(f.audio.src,source);assert.equal(f.audio.currentTime,17);assert.deepEqual(f.operations,before);
  for(const button of f.buttons){assert.equal(button.attributes.get('aria-pressed'),'true');assert.equal(button.attributes.get('aria-label'),copy.en.musicPause);}
  assert.equal(f.credits[0].innerHTML,f.credits[1].innerHTML);
  f.buttons[1].dispatch('click');await settle();
  assert.equal(f.audio.paused,true);assert.equal(f.storage.get('waypoint-sound'),'off');
  assert.ok(f.buttons.every(button=>button.attributes.get('aria-pressed')==='false'));
  f.document.dispatch('pointerdown');f.document.dispatch('waypoint-reader');assert.equal(f.audio.paused,true);
  f.buttons[0].dispatch('click');await settle();assert.equal(f.audio.paused,false);assert.equal(f.audio.currentTime,17);assert.equal(f.audio.src,source);
  controller.destroy();
});

test('hidden documents still pause and resume only when the user wants music',async()=>{
  const f=fixture();const controller=f.init();await settle();const source=f.audio.src;
  f.document.hidden=true;f.document.dispatch('visibilitychange');assert.equal(f.audio.paused,true);
  f.document.hidden=false;f.document.dispatch('visibilitychange');await settle();assert.equal(f.audio.paused,false);
  assert.equal(f.audio.currentTime,17);assert.equal(f.audio.src,source);
  f.buttons[0].dispatch('click');f.document.hidden=true;f.document.dispatch('visibilitychange');f.document.hidden=false;f.document.dispatch('visibilitychange');await settle();
  assert.equal(f.audio.paused,true);assert.equal(f.storage.get('waypoint-sound'),'off');controller.destroy();
});

test('autoplay rejection waits for a gesture, and saved-off visits never start through reading',async()=>{
  const f=fixture({blocked:true});const controller=f.init();await settle();assert.equal(f.audio.paused,true);
  f.unblock();f.document.dispatch('keydown',{key:'Enter',target:f.buttons[1]});await settle();assert.equal(f.audio.paused,true);
  f.document.dispatch('pointerdown');await settle();assert.equal(f.audio.paused,false);controller.destroy();
  const off=fixture({off:true});const offController=off.init();off.document.dispatch('waypoint-reader');off.document.dispatch('pointerdown');await settle();
  assert.equal(off.operations.play,0);assert.equal(off.audio.paused,true);offController.destroy();
});

test('a completed touch click retries rejected pointerdown without overriding manual sound controls',async()=>{
  const f=fixture({blocked:true});const controller=f.init();await settle();
  f.document.dispatch('pointerdown');await settle();assert.equal(f.audio.paused,true);assert.equal(f.operations.play,2);
  f.unblock();f.document.dispatch('click');await settle();assert.equal(f.audio.paused,false);assert.equal(f.operations.play,3);
  f.buttons[1].dispatch('click');f.document.dispatch('click',{target:f.buttons[1]});await settle();
  assert.equal(f.audio.paused,true);assert.equal(f.storage.get('waypoint-sound'),'off');assert.equal(f.operations.play,3);
  f.buttons[0].dispatch('click');f.document.dispatch('click',{target:f.buttons[0]});await settle();
  assert.equal(f.audio.paused,false);assert.equal(f.operations.play,4);assert.equal(f.storage.get('waypoint-sound'),'on');controller.destroy();
});
