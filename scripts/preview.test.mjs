import test from 'node:test';
import assert from 'node:assert/strict';
import {createPreviewSelection} from '../dist/preview-controller.js';

function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function setup(load){const selected=[],shown=[],errors=[];const controller=createPreviewSelection({load,onSelect:state=>selected.push(state),onReady:(screen,state,options)=>shown.push({screen,state,options}),onError:error=>errors.push(error)});return {controller,selected,shown,errors};}

test('late product images cannot replace the last clicked product',async()=>{
  const u=deferred(),v=deferred(),s=deferred();
  const fixture=setup(state=>({u,v,s})[state.app].promise);
  const requests=['u','v','s'].map(app=>fixture.controller.select({app},{animate:true}));
  assert.deepEqual(fixture.selected.map(state=>state.app),['u','v','s']);
  s.resolve('Sidera');await requests[2];
  v.resolve('Viatica');u.resolve('Ultreia');await Promise.all(requests);
  assert.deepEqual(fixture.shown.map(result=>result.screen),['Sidera']);
});
test('language and internal view changes supersede pending screens and errors',async()=>{
  const chinese=deferred(),englishCharts=deferred(),englishActivities=deferred();
  const fixture=setup(state=>state.locale==='zh'?chinese.promise:state.view==='charts'?englishCharts.promise:englishActivities.promise);
  const requests=[fixture.controller.select({app:'ultreia',view:'charts',locale:'zh'}),fixture.controller.select({app:'ultreia',view:'charts',locale:'en'}),fixture.controller.select({app:'ultreia',view:'activities',locale:'en'})];
  chinese.reject(new Error('Old image failed'));englishCharts.resolve('Old charts');englishActivities.resolve('English activities');
  await Promise.all(requests);
  assert.deepEqual(fixture.errors,[]);
  assert.deepEqual(fixture.shown.map(result=>result.state),[{app:'ultreia',view:'activities',locale:'en'}]);
});
test('prepared screens commit immediately, and a failed selection can retry',async()=>{
  let failing=true;
  const fixture=setup(()=>{if(failing)throw new Error('Image unavailable');return 'Prepared screen';});
  fixture.controller.select({app:'viatica'});
  assert.equal(fixture.errors.length,1);
  failing=false;fixture.controller.select({app:'viatica'},{animate:false});
  assert.equal(fixture.shown.length,1);
  assert.equal(fixture.shown[0].options.animate,false);
});
