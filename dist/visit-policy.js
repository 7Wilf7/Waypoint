export const visitPreference='waypoint-analytics-opt-out';
const sources=new Set(['moments','wechat','other']);
const sections=new Set(['about','making','writing','trails']);
export function visitSource(url,referrer='',userAgent='') {
  const source=url.searchParams.get('from');
  if(sources.has(source))return source;
  if(/MicroMessenger/i.test(userAgent))return 'wechat';
  try{if(referrer&&new URL(referrer).origin!==url.origin)return 'other';}catch{}
  return 'direct';
}
export function visitPage(url,{reading=false}={}) {
  if(!['/','/races'].includes(url.pathname))return null;
  if(url.pathname==='/races')return 'races';
  if(/^#(?:entry|read)\//.test(url.hash))return reading?'reading':null;
  const section=url.hash.slice(1);
  return sections.has(section)?section:'home';
}
export function visitPath(source,page){return '/visits/'+source+'/'+page;}
export function visitAllowed({owner=false,optOut=false,dnt,gpc=false}={}){return !owner&&!optOut&&dnt!=='1'&&dnt!=='yes'&&!gpc;}
