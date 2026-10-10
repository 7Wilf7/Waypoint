import {requestJSON} from './loading.js';
import {ownerDeviceState} from './owner-device.js';

export const visitBrowserPreference='waypoint-visit-browser';
const pendingPrefix='waypoint-visit-pending:',excludedKey='waypoint-visit-excluded';
const valid=id=>typeof id==='string'&&/^[a-f0-9]{32}$/.test(id);
let syncing;

function newBrowser(){
  const id=Array.from(crypto.getRandomValues(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,'0')).join('');
  localStorage.setItem(visitBrowserPreference,id);
  const saved=localStorage.getItem(visitBrowserPreference);return valid(saved)?saved:null;
}
// Record each ID separately before reporting it. Two tabs initializing together
// cannot overwrite one another's pending history, even if the active ID changes.
export function visitBrowserForReport(){
  try{
    let id=localStorage.getItem(visitBrowserPreference);if(!valid(id))id=newBrowser();
    if(!id)return null;
    localStorage.setItem(pendingPrefix+id,'1');
    return localStorage.getItem(pendingPrefix+id)==='1'?id:null;
  }catch{return null;}
}
export function pendingVisitBrowsers(){
  const ids=[];
  for(let index=0;index<localStorage.length;index++){
    const key=localStorage.key(index);
    if(key?.startsWith(pendingPrefix)&&valid(key.slice(pendingPrefix.length)))ids.push(key.slice(pendingPrefix.length));
  }
  return [...new Set(ids)].sort();
}
export function rotateVisitBrowser(){
  // Start fresh only when a later visit passes every privacy gate. Changing an
  // owner preference must not create a collection ID while DNT/GPC or opt-out is on.
  try{localStorage.removeItem(visitBrowserPreference);if(localStorage.getItem(visitBrowserPreference)!==null)throw new Error('storage_unavailable');}
  catch{throw new Error('storage_unavailable');}
}
export function syncOwnerVisitHistory(){
  if(syncing)return syncing;
  syncing=(async()=>{
    const browsers=pendingVisitBrowsers();
    if(browsers.length){
      const result=await requestJSON('./api/manage/analytics/browser',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({browsers})});
      if(result?.excluded!==true||JSON.stringify(result.browsers)!==JSON.stringify(browsers))throw new Error('analytics_unavailable');
      const current=localStorage.getItem(visitBrowserPreference);
      if(browsers.includes(current))localStorage.setItem(excludedKey,current);
      for(const id of browsers)localStorage.removeItem(pendingPrefix+id);
    }
    // A deliberate opt-in starts new history; previously excluded visits remain
    // excluded. An unreported new ID need not be registered on every owner read.
    if(!ownerDeviceState().excluded&&localStorage.getItem(excludedKey)===localStorage.getItem(visitBrowserPreference)&&localStorage.getItem(excludedKey))rotateVisitBrowser();
  })().finally(()=>{syncing=null;});
  return syncing;
}
