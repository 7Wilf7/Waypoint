import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateEntry} from '../server/content.js';
import {raceCategories,raceCounts,formatResult,resultSeconds,representativeRace,sortRaces,subtypeLabel} from '../dist/race-utils.js';

const race=(id,category,result,date='2024-05-04',subtype='')=>({id,kind:'race',category,result,date,subtype});
const input={id:'category-test',kind:'race',published:true,titleZh:'分类测试',titleEn:'Category test',date:'2023-04-08',bodyZh:'',bodyEn:'',photos:[],certificates:[]};
test('all race formats and divisions survive editing without changing original dates or missing metrics',()=>{
  for(const category of raceCategories){
    const entry=validateEntry({...input,category,subtype:'男双 Pro',result:'1:25:14',distance:null,ascent:null});
    assert.equal(entry.category,category);assert.equal(entry.subtype,'男双 Pro');assert.equal(entry.date,input.date);assert.equal(entry.distance,null);assert.equal(entry.ascent,null);
  }
  assert.equal(subtypeLabel({subtype:'男双 Pro'},'en'),'Men’s Doubles Pro');
  assert.equal(subtypeLabel({subtype:'男双 Pro'},'zh'),'男双 Pro');
});
test('road representatives use personal bests; varied trail courses and Spartan tiers are not compared by finish time',()=>{
  const records=[race('old-half','Half Marathon','1:53:48'),race('recent-half','Half Marathon','2:05:07','2025-05-04'),race('old-short-trail','Trail','2:07:21'),race('recent-long-trail','Trail','14:34:46','2026-09-05'),race('sprint','Spartan','1:00:18','2026-04-08','Sprint'),race('ultra','Spartan','13:27:32','2025-12-06','Ultra')];
  assert.equal(representativeRace(records,'Half Marathon').entry.id,'old-half');
  assert.equal(representativeRace(records,'Half Marathon').label,'racePersonalBest');
  assert.equal(representativeRace(records,'Trail').entry.id,'recent-long-trail');
  assert.equal(representativeRace(records,'Trail').label,'raceLatestRecord');
  assert.equal(representativeRace(records,'Spartan').entry.id,'ultra');
  assert.equal(representativeRace(records,'Spartan').label,'raceHighestTier');
});
test('formatting keeps each recorded time; empty results cannot become a personal best',()=>{
  assert.equal(formatResult('0:54:30'),'00:54:30');assert.equal(resultSeconds('14:34:46'),52486);
  for(const invalid of ['',null,'01:70:00','00:00:00'])assert.equal(formatResult(invalid),null);
  assert.equal(representativeRace([race('empty','Marathon',''),race('finish','Marathon','4:00:31')],'Marathon').entry.id,'finish');
});
test('archive ordering and counts include each race and exclude articles',()=>{
  const records=[race('old','Trail','4:00:00','2023-01-01'),{id:'article',kind:'article',date:'2026-01-01'},race('recent','Marathon','4:00:31','2025-11-16')];
  const sorted=sortRaces(records);assert.deepEqual(sorted.map(item=>item.id),['recent','old']);
  assert.equal(raceCounts(sorted).Trail,1);assert.equal(raceCounts(sorted).Marathon,1);assert.equal(raceCounts(sorted).Spartan,0);
});
