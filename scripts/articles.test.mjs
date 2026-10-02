import {test} from 'node:test';
import assert from 'node:assert/strict';
import {articleReading,reconcileArticleLayout,validateArticleLayout} from '../dist/article-layout.js';
import {validateEntry} from '../server/content.js';
import {articleStats,sortArticles} from '../dist/article-utils.js';

const article={id:'article-test',kind:'article',published:true,titleZh:'原文',titleEn:'Original article',date:'2026-01-19',publishedTime:'22:00',bodyZh:'开头\n\n小标题\n\n结尾',bodyEn:'Opening\n\nHeading\n\nEnding',photos:['photo-one','photo-two'],certificates:[],wechatUrl:'https://mp.weixin.qq.com/s/original'};
const layout=[{type:'paragraph',index:0},{type:'image',mediaId:'photo-one'},{type:'heading',index:1},{type:'paragraph',index:2}];

test('both editions retain all paragraphs and headings while omitting legacy article photos',()=>{
  const entry=validateEntry({...article,articleLayout:layout});
  for(const language of ['zh','en']) {
    const reading=articleReading(entry,language);
    assert.deepEqual(reading.blocks.filter(block=>block.type!=='image').map(block=>block.text),reading.paragraphs);
    assert.equal(reading.blocks[1].type,'heading');assert.equal(reading.blocks.length,3);
    assert.deepEqual(reading.photos,[]);
  }
});
test('layout rejects missing/reordered/duplicate paragraphs, unlisted media and raw HTML',()=>{
  for(const unsafe of [layout.slice(0,-1),[...layout,{type:'paragraph',index:2}],[{type:'paragraph',index:1},...layout.slice(1)],layout.map(block=>block.type==='image'?{...block,mediaId:'private-unattached'}:block),[...layout,{type:'html',html:'<script>alert(1)</script>'}],[...layout,{type:'image',mediaId:'photo-one'}],{}])assert.throws(()=>validateArticleLayout(unsafe,article),/invalid_article_layout/);
});
test('complete translated paragraph coverage is required for a published layout',()=>{
  assert.throws(()=>validateEntry({...article,articleLayout:layout,bodyEn:'Opening only'}),/invalid_article_layout/);
});
test('editing paragraph boundaries keeps the entire body without reintroducing photos',()=>{
  const edited={...article,bodyZh:article.bodyZh+'\n\n新增段落',bodyEn:article.bodyEn+'\n\nNew paragraph'};
  assert.equal(reconcileArticleLayout(layout,edited),undefined);
  const reading=articleReading({...edited,articleLayout:layout},'en');
  assert.equal(reading.paragraphs.length,4);assert.equal(reading.paragraphs.at(-1),'New paragraph');assert.deepEqual(reading.photos,[]);
});
test('removing an inline photo removes its position while retaining every text paragraph',()=>{
  const edited={...article,photos:['photo-two']};
  const remaining=reconcileArticleLayout(layout,edited);
  assert.deepEqual(remaining,layout.filter(block=>block.type!=='image'));
  assert.equal(articleReading({...edited,articleLayout:remaining},'zh').blocks.length,3);
});
test('legacy articles still show full plain text without images',()=>{
  assert.deepEqual(articleReading(article,'en'),{paragraphs:['Opening','Heading','Ending'],photos:[]});
});
test('reading estimates count the complete current edition, excluding spaces and punctuation',()=>{
  assert.deepEqual(articleStats('山，还在那里。\n\n下次再来！','zh'),{count:9,minutes:1});
  assert.deepEqual(articleStats('A long run.\n\nI will come back.','en'),{count:7,minutes:1});
  assert.deepEqual(articleStats("I'm back after a long-term break.",'en'),{count:6,minutes:1});
  assert.deepEqual(articleStats('山'.repeat(301),'zh'),{count:301,minutes:2});
  assert.deepEqual(articleStats('run '.repeat(181),'en'),{count:181,minutes:2});
  assert.deepEqual(articleStats('。 \n','zh'),{count:0,minutes:0});
});
test('article ordering uses original day and time with deterministic ties',()=>{
  const rows=[{...article,id:'later',date:'2026-10-01',publishedTime:'23:59'},{...article,id:'older',date:'2026-01-19'}, {...article,id:'tie-b',date:'2026-10-01',publishedTime:'15:00'},{...article,id:'tie-a',date:'2026-10-01',publishedTime:'15:00'}, {...article,id:'morning',date:'2026-10-01',publishedTime:'09:00'},{...article,id:'race',kind:'race'}];
  assert.deepEqual(sortArticles(rows).map(row=>row.id),['later','tie-a','tie-b','morning','older']);
  assert.equal(rows[0].id,'later');
});
test('published summaries must include both authored editions while old records remain valid',()=>{
  const entry=validateEntry({...article,summaryZh:'我第一次走进山里。',summaryEn:'My first time on the trails.'});
  assert.equal(entry.summaryEn,'My first time on the trails.');
  for(const summary of [{summaryZh:'只有中文。'},{summaryEn:'English only.'}])assert.throws(()=>validateEntry({...article,...summary}),/summary_translation_required/);
  assert.equal(validateEntry(article).summaryZh,'');
});
test('original publication day/time survive validation; malformed times are rejected',()=>{
  const entry=validateEntry({...article,articleLayout:layout});
  assert.equal(entry.date,'2026-01-19');assert.equal(entry.publishedTime,'22:00');
  for(const publishedTime of ['24:00','23:60','9:00','22:00:00','tomorrow'])assert.throws(()=>validateEntry({...article,publishedTime}),/invalid_published_time/);
  assert.equal(validateEntry({...article,publishedTime:''}).publishedTime,'');
});
