export const raceCategories=['10K','Half Marathon','Marathon','Trail','Spartan','Hyrox','Road','Other'];
export const raceCategoryKeys={'10K':'raceTenK','Half Marathon':'raceHalf','Marathon':'raceFull','Trail':'trail','Spartan':'raceSpartan','Hyrox':'raceHyrox','Road':'road','Other':'other'};
const tiers=['Sprint','Super','Beast','Ultra'];
const groups={'男双 Pro':'Men’s Doubles Pro','男双':'Men’s Doubles','女双':'Women’s Doubles','混双':'Mixed Doubles','男子公开':'Men’s Open','女子公开':'Women’s Open','男子精英':'Men’s Pro','女子精英':'Women’s Pro','女双 Pro':'Women’s Doubles Pro','男子接力':'Men’s Relay','女子接力':'Women’s Relay','混合接力':'Mixed Relay'};

export function subtypeLabel(entry,locale){return locale==='en'?(groups[entry.subtype]||entry.subtype||''):entry.subtype||'';}
export function resultSeconds(result){
  if(!/^\d{1,3}:[0-5]\d(?::[0-5]\d)?$/.test(result||''))return null;
  return result.split(':').reduce((total,part)=>total*60+Number(part),0)||null;
}
export function formatResult(result){return resultSeconds(result)?result.split(':').map(part=>part.padStart(2,'0')).join(':'):null;}
export function sortRaces(entries){return entries.filter(entry=>entry.kind==='race').toSorted((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));}
export function fastestRace(races){return races.filter(race=>resultSeconds(race.result)).toSorted((a,b)=>resultSeconds(a.result)-resultSeconds(b.result)||b.date.localeCompare(a.date))[0]||null;}
export function representativeRace(races,category){
  const selected=sortRaces(races).filter(race=>race.category===category);
  if(['10K','Half Marathon','Marathon'].includes(category))return {entry:fastestRace(selected)||selected[0],label:'racePersonalBest'};
  if(category==='Spartan') {
    const hardest=selected.toSorted((a,b)=>tiers.indexOf(b.subtype)-tiers.indexOf(a.subtype))[0];
    return {entry:hardest,label:hardest&&tiers.includes(hardest.subtype)?'raceHighestTier':'raceLatestRecord'};
  }
  return {entry:selected[0],label:'raceLatestRecord'};
}
export function raceCounts(races){return Object.fromEntries(raceCategories.map(category=>[category,races.filter(race=>race.category===category).length]));}
