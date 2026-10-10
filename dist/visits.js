import {inject,pageview} from './analytics-client.js';
import {analyticsEnabled} from './analytics-config.js';
import {visitPreference,visitSource,visitPage,visitPath,visitAllowed} from './visit-policy.js';
import {ownerDevicePreference,ownerDeviceChanged,ownerDeviceState,rememberOwnerDevice} from './owner-device.js';
import {visitBrowserForReport,syncOwnerVisitHistory} from './visit-browser.js';

export function createVisitTracker({session,refreshSession}={}) {
  let owner=true,ready=false,injected=false,lastPage=null,preference=false,checking=false,checkingPage=null,sessionTicket=0,source=visitSource(new URL(location.href),document.referrer,navigator.userAgent);
  try{preference=localStorage.getItem(visitPreference)==='1';}catch{}
  const eligible=()=>analyticsEnabled&&!ownerDeviceState().excluded&&visitAllowed({optOut:preference,dnt:navigator.doNotTrack,gpc:navigator.globalPrivacyControl});
  const allowed=()=>eligible()&&ready&&!owner;
  const page=()=>visitPage(new URL(location.href),{reading:document.querySelector('.reader-dialog')?.open&&document.querySelector('.reader-dialog').dataset.analytics==='ready'});
  const keyFor=next=>next==='reading'?next+location.hash:next;
  const send=()=>{
    const next=page(),key=keyFor(next);if(!allowed()||document.visibilityState==='hidden'||!next||key===lastPage)return;
    const browser=visitBrowserForReport();if(!browser)return;
    if(!injected){
      inject({mode:'production',disableAutoTrack:true,beforeSend:event=>{
        if(!allowed()||event.type!=='pageview')return null;
        const url=new URL(event.url);if(url.origin!==location.origin||!/^\/visits\/v2\/[a-f0-9]{32}\/(direct|moments|wechat|other)\/(home|races|reading|about|making|writing|trails)$/.test(url.pathname))return null;
        return {type:'pageview',url:url.origin+url.pathname};
      }});injected=true;
    }
    lastPage=key;const route=visitPath(source,next),path='/visits/v2/'+browser+'/'+source+'/'+next;pageview({path,route});
  };
  // Share the initial owner-link read. On returning from another tab, refresh
  // identity before sending: a login there must also exclude this open page.
  function confirmSession(read) {
    const current=++sessionTicket;owner=true;ready=false;checking=true;checkingPage=keyFor(page());
    Promise.resolve().then(read).then(value=>{if(current!==sessionTicket)return;owner=value?.owner!==false;if(value?.owner===true){rememberOwnerDevice();void syncOwnerVisitHistory().catch(()=>{});}ready=true;send();}).catch(()=>{}).finally(()=>{if(current===sessionTicket)checking=false;});
  }
  function resume() {
    if(document.visibilityState==='hidden'||checking||!eligible())return;
    confirmSession(()=>refreshSession?refreshSession():session);
  }
  confirmSession(()=>session);
  document.addEventListener('waypoint-route',()=>{
    const next=page(),key=keyFor(next);
    if(!next||key===lastPage||(checking&&checkingPage===key)||document.visibilityState==='hidden'||!eligible())return;
    // Focus/visibility events are not reliable in every embedded browser. Check
    // again before a new route is reported; page navigation itself never waits.
    if(refreshSession)confirmSession(refreshSession);else send();
  });
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='hidden'){++sessionTicket;checking=false;ready=false;owner=true;}
    else resume();
  });
  window.addEventListener('focus',resume);
  window.addEventListener('storage',event=>{if(event.key===visitPreference){preference=event.newValue==='1';if(!preference&&!ready)resume();else send();}});
  window.addEventListener('storage',event=>{if(event.key===ownerDevicePreference||event.key===null)resume();});
  window.addEventListener(ownerDeviceChanged,resume);
  return {send,disabled:()=>!visitAllowed({owner:false,optOut:preference,dnt:navigator.doNotTrack,gpc:navigator.globalPrivacyControl}),
    setOptOut(value){preference=value;try{if(value)localStorage.setItem(visitPreference,'1');else localStorage.removeItem(visitPreference);}catch{}if(!value){if(!ready)resume();else send();}}};
}
