import {publicationMode} from './publication-config.js';
import {requestJSON} from './loading.js';
import {setPublishedMedia} from './media-images.js';

export async function requestPublishedEntries(kind) {
  if(kind!==undefined&&!['race','article'].includes(kind))throw new Error('invalid_kind');
  if(publicationMode==='live')return requestJSON('/api/entries'+(kind?'?kind='+kind:''));
  if(publicationMode!=='static')throw new Error('unavailable');
  const data=await requestJSON('/published/'+(kind==='race'?'races':kind==='article'?'articles':'catalog')+'.json',{cache:'no-store'});
  if(data.schema!==1||!Array.isArray(data.entries)||data.entries.some(entry=>entry?.published!==true||(kind&&entry.kind!==kind)))throw new Error('unavailable');
  setPublishedMedia(data);
  return data;
}
