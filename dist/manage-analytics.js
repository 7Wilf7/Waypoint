import {analyticsCopy} from './analytics-copy.js';
import {ownerDevicePreference,ownerDeviceChanged,ownerDeviceState,rememberOwnerDevice,setOwnerDevice} from './owner-device.js';

const format=(template,values)=>template.replace(/\{(\w+)\}/g,(_,key)=>values[key]??'');
const count=value=>Number.isSafeInteger(value)&&value>=0;
const breakdownKeys=['sources','devices','countries','browsers','pages'];
function validReport(report,days){
  return report?.provider==='vercel'&&report.days===days&&report.timezone==='Asia/Shanghai'&&
    typeof report.updatedAt==='string'&&Number.isFinite(Date.parse(report.updatedAt))&&
    ['todayViews','todayVisitors','periodViews','totalViews'].every(key=>count(report.summary?.[key]))&&
    Array.isArray(report.daily)&&report.daily.length<=days&&report.daily.every(row=>
      /^\d{4}-\d{2}-\d{2}$/.test(row.date)&&new Date(row.date+'T00:00:00Z').toISOString().slice(0,10)===row.date&&count(row.pageviews))&&
    breakdownKeys.every(key=>Array.isArray(report.breakdowns?.[key])&&report.breakdowns[key].every(row=>
      typeof row.key==='string'&&row.key.length>0&&row.key.length<=160&&count(row.pageviews)));
}
function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!=null)node.textContent=text;return node;}

export function createAnalyticsPanel({api,onUnauthorized}){
  const root=document.documentElement,panel=document.querySelector('.manage-analytics');
  const content=panel.querySelector('.analytics-content'),status=panel.querySelector('.analytics-status'),progress=panel.querySelector('.analytics-progress');
  const refreshButton=panel.querySelector('[data-analytics-refresh]'),copyButton=panel.querySelector('[data-analytics-copy-link]');
  const copyStatus=panel.querySelector('.analytics-copy-status'),manualCopy=panel.querySelector('.analytics-manual-copy'),linkInput=manualCopy.querySelector('input');
  const deviceChoice=panel.querySelector('[data-analytics-owner-device]'),deviceStatus=panel.querySelector('#owner-device-status');
  let owner=false,days=7,report=null,state='idle',ticket=0,copyTicket=0,copyState='';
  const language=()=>root.dataset.language==='en'?'en':'zh';
  const words=()=>analyticsCopy[language()];
  const locale=()=>language()==='en'?'en-US':'zh-CN';
  const number=value=>new Intl.NumberFormat(locale()).format(value);
  const date=value=>new Intl.DateTimeFormat(locale(),{timeZone:'Asia/Shanghai',month:'short',day:'numeric'}).format(new Date(value+'T00:00:00+08:00'));
  const fullDate=value=>new Intl.DateTimeFormat(locale(),{timeZone:'Asia/Shanghai',year:'numeric',month:'short',day:'numeric'}).format(new Date(value+'T00:00:00+08:00'));

  function renderOwnerDevice(){
    const state=ownerDeviceState();deviceChoice.checked=state.excluded;deviceChoice.disabled=!owner;
    deviceStatus.textContent=words()[!state.saved?'ownerDeviceUnsaved':state.excluded?'ownerDeviceExcluded':'ownerDeviceIncluded'];
  }

  function renderStatus(){
    const w=words();status.replaceChildren();progress.hidden=state!=='loading';progress.setAttribute('aria-label',w.loading);
    refreshButton.disabled=!owner||state==='loading';refreshButton.textContent=['notConfigured','unavailable'].includes(state)?w.retry:w.refresh;
    refreshButton.setAttribute('aria-busy',String(state==='loading'));content.setAttribute('aria-busy',String(state==='loading'));
    if(state==='loading')status.textContent=w.loading;
    else if(state==='ready'&&report)status.textContent=format(w.updated,{time:new Intl.DateTimeFormat(locale(),{timeZone:'Asia/Shanghai',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(report.updatedAt))});
    else if(['notConfigured','unavailable'].includes(state)){
      status.append(element('strong','analytics-error-title',w[state]),element('span','analytics-error-help',w[state+'Help']));
    }
    status.classList.toggle('has-error',['notConfigured','unavailable'].includes(state));
  }
  function breakdownLabel(kind,key){
    const w=words();
    if(kind==='sources')return w.sourceLabels[key]||w.sourceLabels.other;
    if(kind==='devices')return w.deviceLabels[key]||w.deviceLabels.other;
    if(kind==='pages')return w.pageLabels[key]||w.pageLabels.other;
    if(key.toLowerCase()==='unknown')return w.unknown;
    if(key.toLowerCase()==='others'||key.toLowerCase()==='other')return w.others;
    if(kind==='browsers')return key.toLowerCase()==='wechat'?w.wechatBrowser:key;
    if(/^[A-Z]{2}$/.test(key))try{return new Intl.DisplayNames([locale()],{type:'region'}).of(key)||key;}catch{}
    return key;
  }
  function renderBreakdown(kind,rows){
    const w=words(),section=element('section','analytics-breakdown'),heading=element('div','analytics-breakdown-heading');
    heading.append(element('h3','',w[kind]),element('span','',w.pageviews));section.append(heading);
    if(!rows.length||rows.every(row=>row.pageviews===0)){section.append(element('p','analytics-breakdown-empty',w.emptyBreakdown));return section;}
    const list=element('ol','analytics-breakdown-list'),total=rows.reduce((sum,row)=>sum+row.pageviews,0);
    for(const row of [...rows].sort((a,b)=>b.pageviews-a.pageviews)){
      const item=element('li'),label=element('div','analytics-breakdown-label'),track=element('div','analytics-breakdown-track'),bar=element('span');
      label.append(element('span','',breakdownLabel(kind,row.key)),element('strong','',number(row.pageviews)));
      track.setAttribute('aria-hidden','true');bar.style.width=(row.pageviews/total*100)+'%';track.append(bar);item.append(label,track);list.append(item);
    }
    section.append(list);return section;
  }
  function renderData(){
    const detailsOpen=content.querySelector('.analytics-daily-details')?.open;
    content.replaceChildren();content.hidden=!report;
    if(!report)return;
    const w=words(),metrics=element('dl','analytics-metrics');
    for(const [key,unit]of [['todayViews','PV'],['todayVisitors','UV'],['periodViews','PV'],['totalViews','PV']]){
      const item=element('div','analytics-metric'),label=element('dt'),abbreviation=element('abbr','',unit);
      abbreviation.title=unit==='PV'?w.pageviews:w.visitors;label.append(element('span','',w[key]),abbreviation);item.append(label,element('dd','',number(report.summary[key])));metrics.append(item);
    }
    const trend=element('section','analytics-trend'),heading=element('div','analytics-trend-heading');
    heading.append(element('h3','',w.trend),element('p','',format(w.trendSummary,{days})));trend.append(heading);
    const peak=Math.max(0,...report.daily.map(row=>row.pageviews)),chart=element('div','analytics-chart');chart.setAttribute('aria-hidden','true');
    chart.style.gridTemplateColumns='repeat('+Math.max(1,report.daily.length)+',minmax(0,1fr))';
    for(const row of report.daily){
      const column=element('div','analytics-chart-column'),bar=element('span','analytics-chart-bar');
      column.title=fullDate(row.date)+' · '+number(row.pageviews)+' '+w.pageviews;bar.style.height=(peak?row.pageviews/peak*100:0)+'%';
      if(row.pageviews>0)bar.classList.add('has-views');column.append(bar);chart.append(column);
    }
    trend.append(element('p','analytics-chart-peak',format(w.peak,{count:number(peak)})),chart);
    if(report.daily.length){
      const axis=element('div','analytics-chart-axis');axis.setAttribute('aria-hidden','true');axis.append(element('span','',date(report.daily[0].date)),element('span','',date(report.daily.at(-1).date)));trend.append(axis);
    }
    if(report.summary.periodViews===0)trend.append(element('p','analytics-empty',w.empty));
    const details=element('details','analytics-daily-details'),summary=element('summary','',w.dailyDetails),table=element('table'),caption=element('caption','sr-only',format(w.trendSummary,{days}));
    const thead=element('thead'),head=element('tr'),tbody=element('tbody');
    for(const label of [w.date,w.pageviews]){const th=element('th','',label);th.scope='col';head.append(th);}thead.append(head);
    for(const row of report.daily){const tr=element('tr'),day=element('th','',fullDate(row.date));day.scope='row';tr.append(day,element('td','',number(row.pageviews)));tbody.append(tr);}
    table.append(caption,thead,tbody);details.append(summary,table);details.open=!!detailsOpen;trend.append(details);
    const breakdowns=element('div','analytics-breakdowns');for(const kind of breakdownKeys)breakdowns.append(renderBreakdown(kind,report.breakdowns[kind]));
    content.append(metrics,trend,breakdowns);
  }
  function renderCopy(){
    const w=words();copyButton.disabled=!owner||copyState==='copying';copyButton.textContent=copyState==='copying'?w.copying:w.copyLink;
    copyStatus.textContent=copyState&&copyState!=='copying'?w[copyState]:'';
    manualCopy.hidden=copyState!=='copyFailed';
  }
  function translate(){
    const w=words();panel.querySelectorAll('[data-analytics-copy]').forEach(node=>node.textContent=w[node.dataset.analyticsCopy]);
    panel.querySelectorAll('[data-analytics-aria]').forEach(node=>node.setAttribute('aria-label',w[node.dataset.analyticsAria]));
    for(const button of panel.querySelectorAll('[data-analytics-days]'))button.setAttribute('aria-pressed',String(Number(button.dataset.analyticsDays)===days));
    renderStatus();renderData();renderCopy();renderOwnerDevice();
  }
  async function refresh(){
    if(!owner)return;
    const current=++ticket,requestedDays=days;if(report?.days!==requestedDays)report=null;state='loading';translate();
    try{
      const result=await api('manage/analytics?days='+requestedDays);
      if(current!==ticket||!owner)return;
      if(!validReport(result,requestedDays))throw new Error('analytics_unavailable');
      report=result;state='ready';translate();
    }catch(error){
      if(current!==ticket||!owner)return;
      if(error.message==='owner_required'||error.message==='auth_changed'){
        setOwner(false);Promise.resolve(onUnauthorized?.()).catch(()=>{});return;
      }
      report=null;state=error.message==='analytics_not_configured'?'notConfigured':'unavailable';translate();
    }
  }
  function setOwner(value,{load=true}={}){
    if(value===true){rememberOwnerDevice();if(owner){renderOwnerDevice();return;}owner=true;panel.hidden=false;if(load)void refresh();else{state='unavailable';translate();}return;}
    owner=false;++ticket;++copyTicket;report=null;state='idle';copyState='';panel.hidden=true;content.replaceChildren();linkInput.value='';translate();
  }
  for(const button of panel.querySelectorAll('[data-analytics-days]'))button.addEventListener('click',()=>{
    const next=Number(button.dataset.analyticsDays);if(!owner||next===days)return;days=next;void refresh();
  });
  refreshButton.addEventListener('click',()=>{if(state!=='loading')void refresh();});
  deviceChoice.addEventListener('change',()=>{if(owner)setOwnerDevice(deviceChoice.checked);});
  window.addEventListener(ownerDeviceChanged,renderOwnerDevice);
  window.addEventListener('storage',event=>{if(event.key===ownerDevicePreference||event.key===null)renderOwnerDevice();});
  copyButton.addEventListener('click',async()=>{
    if(!owner||copyState==='copying')return;
    const current=++copyTicket,url=new URL('/',location.origin);url.searchParams.set('from','moments');linkInput.value=url.href;copyState='copying';renderCopy();
    try{await navigator.clipboard.writeText(url.href);if(current!==copyTicket||!owner)return;copyState='copied';}
    catch{if(current!==copyTicket||!owner)return;copyState='copyFailed';}
    renderCopy();if(copyState==='copyFailed'){linkInput.focus();linkInput.select();}
  });
  translate();
  return {setOwner,translate};
}
