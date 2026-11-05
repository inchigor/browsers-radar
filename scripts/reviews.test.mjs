import test from 'node:test';
import assert from 'node:assert/strict';
import {parseReviews, compareReviews, mergeReviews, storeImportedReviews} from '../site/reviews.mjs';

const current={a:{status:'testing',note:'local',reviewedAt:'2026-01-01'},b:{status:'checked',note:'same'},onlyLocal:{status:'watch'}};
const imported={a:{status:'rejected',note:'imported'},b:{note:'same',status:'checked'},unknown:{status:'new',note:'unknown browser'}};

test('exported JSON parses and compares new, identical and conflicting entries',()=>{
  const parsed=parseReviews(JSON.stringify(imported));
  assert.deepEqual(compareReviews(current,parsed),{new:1,identical:1,conflicts:1});
  assert.deepEqual(parseReviews(JSON.stringify(current)),current);
});
test('keep or replace conflicts without losing unrelated or unknown entries',()=>{
  const keep=mergeReviews(current,imported,'keep');
  const replace=mergeReviews(current,imported,'replace');
  assert.deepEqual(keep.a,current.a);
  assert.deepEqual(replace.a,imported.a);
  for(const result of [keep,replace]){assert.deepEqual(result.unknown,imported.unknown);assert.deepEqual(result.onlyLocal,current.onlyLocal);}
  assert.equal(current.a.note,'local');
  assert.throws(()=>mergeReviews(current,imported,'invalid'));
});
test('invalid JSON, shapes, statuses and unsafe keys are rejected',()=>{
  for(const text of ['{', '[]', 'null', '{"x":null}', '{"x":[]}', '{"x":{"status":"bad"}}', '{"x":{"status":"new","note":2}}', '{"x":{"status":"new","reviewedAt":null}}', '{"__proto__":{"status":"new"}}']){
    assert.throws(()=>parseReviews(text),text);
  }
});
test('comparison includes notes and metadata, independent of object key order',()=>{
  assert.deepEqual(compareReviews({x:{status:'new',note:'n',reviewedAt:'one'}},{x:{note:'n',status:'new',reviewedAt:'two'}}),{new:0,identical:0,conflicts:1});
  assert.deepEqual(compareReviews({x:{status:'new',note:'n'}},{x:{note:'n',status:'new'}}),{new:0,identical:1,conflicts:0});
});

test('storage failures or changes in another tab do not mutate current reviews',()=>{
  const original=JSON.stringify(current);
  const failing={getItem:()=>original,setItem:()=>{throw new Error('quota');}};
  assert.throws(()=>storeImportedReviews(failing,'key',original,current,imported,'replace'),/quota/);
  assert.equal(JSON.stringify(current),original);
  let writes=0;
  const changed={getItem:()=>'{"changed":true}',setItem:()=>writes++};
  assert.throws(()=>storeImportedReviews(changed,'key',original,current,imported,'replace'),/другой вкладке/);
  assert.equal(writes,0);
});
