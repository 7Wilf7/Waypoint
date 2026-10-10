import {createHash} from 'node:crypto';
import {readAnalyticsExclusions,VISIT_BROWSER,MAX_EXCLUDED_BROWSERS} from './analytics-exclusions.js';

const API='https://api.vercel.com/v1/query/web-analytics/visits/';
const DAY=86400000,HOUR=3600000,OFFSET=8*HOUR;
const cache=new Map();
const validPages=new Set(['home','races','reading','about','making','writing','trails']);
const validSources=new Set(['direct','moments','wechat','other']);
const failure=()=>new Error('analytics_unavailable');
const count=value=>{if(!Number.isSafeInteger(value)||value<0)throw failure();return value;};
const localDate=timestamp=>new Date(timestamp+OFFSET).toISOString().slice(0,10);

function settings(env) {
  const token=env.WAYPOINT_ANALYTICS_TOKEN,project=env.WAYPOINT_ANALYTICS_PROJECT_ID,team=env.WAYPOINT_ANALYTICS_TEAM_ID;
  if(!token||!/^prj_[a-zA-Z0-9]+$/.test(project||'')||(team&&!/^team_[a-zA-Z0-9]+$/.test(team)))throw new Error('analytics_not_configured');
  return {token,project,team};
}
async function readResponse(response) {
  if(Number(response.headers.get('content-length'))>1024*1024)throw failure();
  const reader=response.body?.getReader();if(!reader)throw failure();
  const chunks=[];let length=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>1024*1024)throw failure();chunks.push(value);}}
  finally{await reader.cancel().catch(()=>{});}
  const text=Buffer.concat(chunks).toString('utf8');
  if(!response.ok) {
    // Never forward provider errors, URLs or credentials to the browser.
    if(response.status===400&&text.length<2000&&text.includes('web_analytics_not_enabled'))throw new Error('analytics_not_configured');
    throw failure();
  }
  try{return JSON.parse(text);}catch{throw failure();}
}
async function query(config,parameters,fetchFn,endpoint='aggregate') {
  const url=new URL(API+endpoint);url.searchParams.set('projectId',config.project);
  if(config.team)url.searchParams.set('teamId',config.team);
  for(const [key,value]of Object.entries(parameters))url.searchParams.set(key,String(value));
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try {
    const response=await fetchFn(url,{headers:{authorization:'Bearer '+config.token},signal:controller.signal,redirect:'error',cache:'no-store'});
    return await readResponse(response);
  }catch(error){if(error.message==='analytics_not_configured')throw error;throw failure();}
  finally{clearTimeout(timer);}
}
function rows(result){if(!Array.isArray(result.data))throw failure();return result.data;}
function sumBy(rows,key) {
  const totals=new Map();
  for(const row of rows){const value=key(row);totals.set(value,(totals.get(value)||0)+count(row.pageviews));}
  return [...totals].map(([key,pageviews])=>({key,pageviews})).sort((a,b)=>b.pageviews-a.pageviews||a.key.localeCompare(b.key));
}
function routeParts(row) {
  const match=/^\/visits\/(direct|moments|wechat|other)\/(home|races|reading|about|making|writing|trails)$/.exec(row.route||'');
  return match?{source:match[1],page:match[2]}:{source:'other',page:'other'};
}
export function analyticsFilter(excluded=[]){
  if(!Array.isArray(excluded)||excluded.length>MAX_EXCLUDED_BROWSERS||excluded.some(id=>!VISIT_BROWSER.test(id)))throw failure();
  const owner=[...new Set(excluded)].sort().map(id=>"startswith(requestPath, '/visits/v2/"+id+"/')");
  const filter="environment eq 'production' and startswith(requestPath, '/visits/v2/')"+(owner.length?' and not ('+owner.join(' or ')+')':'');
  if(filter.length>2048)throw failure();return filter;
}
export async function fetchAnalytics(env,days,{fetchFn=fetch,now=Date.now(),excluded=[]}={}) {
  if(![7,30].includes(days))throw new Error('invalid_range');
  const config=settings(env),today=Math.floor((now+OFFSET)/DAY)*DAY-OFFSET,start=today-(days-1)*DAY;
  const common={filter:analyticsFilter(excluded),limit:100};
  const range={...common,since:new Date(start).toISOString(),until:new Date(now).toISOString()};
  // The API's maximum limit is 100. Four-day chunks contain at most 97 hourly
  // buckets, including inclusive endpoints; never silently fold time into Others.
  const chunks=[];
  for(let since=start;since<=now;since+=4*DAY)chunks.push({since,until:Math.min(since+4*DAY-1,now)});
  const results=await Promise.all([
    Promise.all(chunks.map(chunk=>query(config,{...common,by:'hour',since:new Date(chunk.since).toISOString(),until:new Date(chunk.until).toISOString()},fetchFn))),
    query(config,{...common,by:'environment',since:new Date(today).toISOString(),until:range.until},fetchFn),
    query(config,{filter:common.filter},fetchFn,'count'),
    ...['route','deviceType','country','browserName'].map(by=>query(config,{...range,by},fetchFn))
  ]);
  const [trends,todayResult,totalResult,paths,devices,countries,browsers]=results;
  const daily=Array.from({length:days},(_,i)=>({date:localDate(start+i*DAY),pageviews:0})),byDate=new Map(daily.map(row=>[row.date,row]));
  for(let index=0;index<trends.length;index++) {
    for(const row of rows(trends[index])) {
      const time=Date.parse(row.timestamp);
      if(!Number.isFinite(time)||time<chunks[index].since||time>chunks[index].until||!byDate.has(localDate(time)))throw failure();
      byDate.get(localDate(time)).pageviews+=count(row.pageviews);
    }
  }
  const todayRows=rows(todayResult);if(todayRows.length>1||todayRows.some(row=>row.environment!=='production'))throw failure();
  if(todayRows.length)count(todayRows[0].pageviews);
  // Independent queries have no shared snapshot: late ingestion can legitimately
  // change their PV totals. Keep PV consistent with the chart; UV is an estimate.
  const todayViews=daily.at(-1).pageviews,todayVisitors=todayRows.length?count(todayRows[0].visitors):0;
  return {provider:'vercel',days,timezone:'Asia/Shanghai',updatedAt:new Date(now).toISOString(),
    summary:{todayViews,todayVisitors,periodViews:daily.reduce((sum,row)=>sum+row.pageviews,0),totalViews:count(totalResult.data?.pageviews)},daily,
    breakdowns:{
      sources:sumBy(rows(paths),row=>validSources.has(routeParts(row).source)?routeParts(row).source:'other'),
      pages:sumBy(rows(paths),row=>validPages.has(routeParts(row).page)?routeParts(row).page:'other'),
      devices:sumBy(rows(devices),row=>['mobile','desktop','tablet'].includes(String(row.deviceType).toLowerCase())?String(row.deviceType).toLowerCase():'other'),
      countries:sumBy(rows(countries),row=>/^[A-Z]{2}$/.test(row.country||'')?row.country:row.country==='Others'?'Others':'unknown'),
      browsers:sumBy(rows(browsers),row=>typeof row.browserName==='string'&&/^[a-zA-Z0-9 .()-]{1,48}$/.test(row.browserName)?row.browserName:'Other')
    }};
}
export async function getAnalytics(env,days,store) {
  const config=settings(env),now=Date.now();
  // Read the authority before cache lookup: a login in another Function must
  // invalidate every report, including its chart, visitor estimate and totals.
  const exclusions=await readAnalyticsExclusions(store);
  const key=config.project+':'+(config.team||'')+':'+createHash('sha256').update(config.token).digest('hex')+':'+days+':'+localDate(now)+':'+exclusions.etag;
  const current=cache.get(key);
  if(current&&current.expires>now)return current.promise;
  const entry={expires:now+60000,promise:fetchAnalytics(env,days,{excluded:exclusions.browsers})};cache.set(key,entry);
  if(cache.size>8)cache.delete(cache.keys().next().value);
  try{return await entry.promise;}catch(error){if(cache.get(key)===entry)cache.delete(key);throw error;}
}
