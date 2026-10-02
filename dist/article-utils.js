export function sortArticles(entries) {
  return entries.filter(entry=>entry.kind==='article').toSorted((a,b)=>b.date.localeCompare(a.date)||(b.publishedTime||'00:00').localeCompare(a.publishedTime||'00:00')||a.id.localeCompare(b.id));
}

// Estimates use the complete edition, excluding whitespace and punctuation.
export function articleStats(body,language) {
  const text=typeof body==='string'?body:'';
  const count=language==='en'
    ? (text.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)||[]).length
    : (text.match(/[\p{L}\p{N}]/gu)||[]).length;
  return {count,minutes:count?Math.max(1,Math.ceil(count/(language==='en'?180:300))):0};
}
