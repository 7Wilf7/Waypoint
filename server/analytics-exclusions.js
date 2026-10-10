import {BlobPreconditionFailedError} from '@vercel/blob';

export const VISIT_BROWSER=/^[a-f0-9]{32}$/;
// A complete filter must fit Vercel's documented 2048-character limit.
export const MAX_EXCLUDED_BROWSERS=26;

export async function readAnalyticsExclusions(store){
  const record=await store.analyticsExclusions();
  if(record===null)return {browsers:[],etag:null};
  if(record?.version!==1||!Array.isArray(record.browsers)||record.browsers.length>MAX_EXCLUDED_BROWSERS||record.browsers.some(id=>!VISIT_BROWSER.test(id))||typeof record.etag!=='string')throw new Error('analytics_unavailable');
  return record;
}
// Owner-only callers append permanently. Conditional writes preserve concurrent
// browser logins; excluded history must never return when a preference changes.
export async function excludeAnalyticsBrowsers(store,ids){
  if(!Array.isArray(ids)||ids.length<1||ids.length>MAX_EXCLUDED_BROWSERS||ids.some(id=>typeof id!=='string'||!VISIT_BROWSER.test(id)))throw new Error('invalid_browsers');
  for(let attempt=0;attempt<5;attempt++){
    const previous=await readAnalyticsExclusions(store),browsers=[...new Set([...previous.browsers,...ids])].sort();
    if(browsers.length===previous.browsers.length)return;
    if(browsers.length>MAX_EXCLUDED_BROWSERS)throw new Error('analytics_exclusion_limit');
    try{await store.saveAnalyticsExclusions({version:1,browsers},previous);return;}
    catch(error){if(!(error instanceof BlobPreconditionFailedError)&&error.message!=='analytics_changed'&&!/already exists/i.test(error.message))throw error;}
  }
  throw new Error('analytics_unavailable');
}
