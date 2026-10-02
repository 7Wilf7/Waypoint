import {raceCategories} from '../dist/race-utils.js';
import {validateArticleLayout} from '../dist/article-layout.js';
import {racePhotoRoles} from '../dist/race-photos.js';
export const ID = /^[a-z0-9-]{1,64}$/i;
export const MAX_FILE = 8 * 1024 * 1024;
const text = (value, limit = 60000) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10) === value;

export function validateEntry(input) {
  if (!input || !['race','article'].includes(input.kind) || !ID.test(input.id || '')) throw new Error('invalid_entry');
  const entry = {id:input.id,kind:input.kind,published:input.published === true,titleZh:text(input.titleZh,160),titleEn:text(input.titleEn,160),date:text(input.date,10),bodyZh:text(input.bodyZh),bodyEn:text(input.bodyEn),photos:[],certificates:[]};
  if (!entry.titleZh || !validDate(entry.date)) throw new Error('title_date_required');
  if (entry.published && (!entry.titleEn || (entry.bodyZh && !entry.bodyEn))) throw new Error('english_required');
  for (const field of ['photos','certificates']) {
    if (!Array.isArray(input[field]) || input[field].length > 20 || input[field].some(id=>!ID.test(id))) throw new Error('invalid_media');
    entry[field] = [...new Set(input[field])];
  }
  if (entry.kind === 'article') {
    if (entry.published && (!entry.bodyZh || !entry.bodyEn)) throw new Error('article_body_required');
    entry.summaryZh=text(input.summaryZh,600);
    entry.summaryEn=text(input.summaryEn,600);
    if(entry.published&&Boolean(entry.summaryZh)!==Boolean(entry.summaryEn))throw new Error('summary_translation_required');
    entry.publishedTime = text(input.publishedTime,20);
    if(entry.publishedTime&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(entry.publishedTime))throw new Error('invalid_published_time');
    const layout=validateArticleLayout(input.articleLayout,entry);
    if(layout)entry.articleLayout=layout;
    entry.wechatUrl = text(input.wechatUrl,2000);
    if (entry.wechatUrl) {
      let url;
      try {url = new URL(entry.wechatUrl);} catch {throw new Error('invalid_wechat_url');}
      if (url.protocol !== 'https:' || url.hostname !== 'mp.weixin.qq.com' || url.username || url.password) throw new Error('invalid_wechat_url');
    }
  } else {
    if(entry.photos.length>2||entry.certificates.length>1)throw new Error('race_photo_limit');
    if(Object.hasOwn(input,'primaryPhoto')||Object.hasOwn(input,'secondaryPhoto')) {
      for(const field of ['primaryPhoto','secondaryPhoto'])if(typeof input[field]!=='string'||(input[field]&&!ID.test(input[field])))throw new Error('invalid_photo_roles');
      const {primary,secondary}=racePhotoRoles(input),roles=[primary,secondary].filter(Boolean);
      if(new Set(roles).size!==roles.length||roles.length!==entry.photos.length||roles.some(id=>!entry.photos.includes(id)))throw new Error('invalid_photo_roles');
      entry.primaryPhoto=primary;entry.secondaryPhoto=secondary;
      entry.photos=roles;
    }
    entry.category = raceCategories.includes(input.category) ? input.category : 'Trail';
    entry.subtype = text(input.subtype,80);
    for (const field of ['distance','ascent']) {
      const number = input[field] === '' || input[field] == null ? null : Number(input[field]);
      if (number !== null && (!Number.isFinite(number) || number < 0 || number > (field === 'distance' ? 10000 : 100000))) throw new Error('invalid_metrics');
      entry[field] = number;
    }
    entry.result = text(input.result,20);
    if (entry.result && !/^\d{1,3}:[0-5]\d(?::[0-5]\d)?$/.test(entry.result)) throw new Error('invalid_result');
  }
  return entry;
}

export function fileType(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if ([137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)) return 'image/png';
  const header = new TextDecoder().decode(bytes.slice(0,16));
  if (header.startsWith('RIFF') && header.slice(8,12) === 'WEBP') return 'image/webp';
  if (header.startsWith('%PDF-')) return 'application/pdf';
  return null;
}
