import {test} from 'node:test';
import assert from 'node:assert/strict';
import {articleReading,reconcileArticleLayout,validateArticleLayout} from '../dist/article-layout.js';
import {validateEntry} from '../server/content.js';

const article={id:'article-test',kind:'article',published:true,titleZh:'原文',titleEn:'Original article',date:'2026-01-19',publishedTime:'22:00',bodyZh:'开头\n\n小标题\n\n结尾',bodyEn:'Opening\n\nHeading\n\nEnding',photos:['photo-one','photo-two'],certificates:[],wechatUrl:'https://mp.weixin.qq.com/s/original'};
const layout=[{type:'paragraph',index:0},{type:'image',mediaId:'photo-one'},{type:'heading',index:1},{type:'paragraph',index:2}];

test('both editions retain all paragraphs, heading positions and an inline photo exactly once',()=>{
  const entry=validateEntry({...article,articleLayout:layout});
  for(const language of ['zh','en']) {
    const reading=articleReading(entry,language);
    assert.deepEqual(reading.blocks.filter(block=>block.type!=='image').map(block=>block.text),reading.paragraphs);
    assert.equal(reading.blocks[1].mediaId,'photo-one');assert.equal(reading.blocks[2].type,'heading');
    assert.deepEqual(reading.photos,['photo-two']);
  }
});
test('layout rejects missing/reordered/duplicate paragraphs, unlisted media and raw HTML',()=>{
  for(const unsafe of [layout.slice(0,-1),[...layout,{type:'paragraph',index:2}],[{type:'paragraph',index:1},...layout.slice(1)],layout.map(block=>block.type==='image'?{...block,mediaId:'private-unattached'}:block),[...layout,{type:'html',html:'<script>alert(1)</script>'}],[...layout,{type:'image',mediaId:'photo-one'}],{}])assert.throws(()=>validateArticleLayout(unsafe,article),/invalid_article_layout/);
});
test('complete translated paragraph coverage is required for a published layout',()=>{
  assert.throws(()=>validateEntry({...article,articleLayout:layout,bodyEn:'Opening only'}),/invalid_article_layout/);
});
test('editing paragraph boundaries keeps the entire body and falls back to the photo gallery',()=>{
  const edited={...article,bodyZh:article.bodyZh+'\n\n新增段落',bodyEn:article.bodyEn+'\n\nNew paragraph'};
  assert.equal(reconcileArticleLayout(layout,edited),undefined);
  const reading=articleReading({...edited,articleLayout:layout},'en');
  assert.equal(reading.paragraphs.length,4);assert.equal(reading.paragraphs.at(-1),'New paragraph');assert.deepEqual(reading.photos,article.photos);
});
test('removing an inline photo removes its position while retaining every text paragraph',()=>{
  const edited={...article,photos:['photo-two']};
  const remaining=reconcileArticleLayout(layout,edited);
  assert.deepEqual(remaining,layout.filter(block=>block.type!=='image'));
  assert.equal(articleReading({...edited,articleLayout:remaining},'zh').blocks.length,3);
});
test('legacy articles still show full plain text and their photos',()=>{
  assert.deepEqual(articleReading(article,'en'),{paragraphs:['Opening','Heading','Ending'],photos:article.photos});
});
test('original publication day/time survive validation; malformed times are rejected',()=>{
  const entry=validateEntry({...article,articleLayout:layout});
  assert.equal(entry.date,'2026-01-19');assert.equal(entry.publishedTime,'22:00');
  for(const publishedTime of ['24:00','23:60','9:00','22:00:00','tomorrow'])assert.throws(()=>validateEntry({...article,publishedTime}),/invalid_published_time/);
  assert.equal(validateEntry({...article,publishedTime:''}).publishedTime,'');
});
