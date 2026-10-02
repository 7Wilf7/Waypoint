export const articleParagraphs = body => typeof body === 'string' ? body.split(/\n\s*\n/).map(text=>text.trim()).filter(Boolean) : [];

// Layout refers to plain-text paragraphs and attached media, never imported HTML.
export function validateArticleLayout(layout,entry) {
  if(layout==null)return undefined;
  const chinese=articleParagraphs(entry.bodyZh),english=articleParagraphs(entry.bodyEn);
  if(!Array.isArray(layout)||layout.length>1000||(entry.published&&chinese.length!==english.length))throw new Error('invalid_article_layout');
  let next=0;
  const images=new Set();
  const clean=layout.map(block=>{
    if(block?.type==='paragraph'||block?.type==='heading') {
      if(!Number.isInteger(block.index)||block.index!==next||next>=chinese.length)throw new Error('invalid_article_layout');
      next++;return {type:block.type,index:block.index};
    }
    if(block?.type==='image'&&entry.photos.includes(block.mediaId)&&!images.has(block.mediaId)) {
      images.add(block.mediaId);return {type:'image',mediaId:block.mediaId};
    }
    throw new Error('invalid_article_layout');
  });
  if(next!==chinese.length)throw new Error('invalid_article_layout');
  return clean;
}

// A body edit may change paragraph boundaries. Fall back to the complete text
// and photo gallery rather than applying stale positions or losing content.
export function reconcileArticleLayout(layout,entry) {
  if(!Array.isArray(layout))return undefined;
  try{return validateArticleLayout(layout.filter(block=>block.type!=='image'||entry.photos.includes(block.mediaId)),entry);}
  catch{return undefined;}
}

export function articleReading(entry,language) {
  const paragraphs=articleParagraphs(language==='en'?entry.bodyEn:entry.bodyZh);
  const layout=reconcileArticleLayout(entry.articleLayout,entry);
  if(!layout||layout.some(block=>block.type!=='image'&&block.index>=paragraphs.length))return {paragraphs,photos:entry.photos};
  const inline=new Set(layout.filter(block=>block.type==='image').map(block=>block.mediaId));
  return {paragraphs,blocks:layout.map(block=>block.type==='image'?block:{type:block.type,text:paragraphs[block.index]}),photos:entry.photos.filter(id=>!inline.has(id))};
}
