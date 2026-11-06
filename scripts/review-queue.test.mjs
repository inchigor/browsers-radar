import test from 'node:test';
import assert from 'node:assert/strict';
import {partitionCatalog,verifiedFeature} from '../site/review-queue.mjs';

test('new discoveries wait for approval; curated and approved records appear in catalog',()=>{
  const curated=[{id:'Org/Curated',repo:'Org/Curated',name:'Curated'}];
  const candidates=[{id:'org/curated',repo:'org/curated',name:'duplicate'}, {id:'org/new',repo:'org/new'}, {id:'org/approved',repo:'org/approved'}, {id:'WebKit/WebKit',repo:'WebKit/WebKit'}];
  const {catalog,pending}=partitionCatalog(curated,candidates,['ORG/APPROVED']);
  assert.deepEqual(catalog.map(x=>x.id),['Org/Curated','org/approved']);
  assert.deepEqual(pending.map(x=>x.id),['org/new']);
});
test('feature requires explicit value, checked date and secure source',()=>{
  assert.equal(verifiedFeature({},'macos'),null);
  assert.equal(verifiedFeature({verification:{macos:{value:'yes',checkedAt:'2026-11-05',source:'http://example.org'}}},'macos'),null);
  assert.equal(verifiedFeature({verification:{macos:{value:'yes',source:'https://example.org'}}},'macos'),null);
  assert.equal(verifiedFeature({verification:{macos:{value:'yes',checkedAt:'2026-02-30',source:'https://example.org'}}},'macos'),null);
  const proof={value:'no',checkedAt:'2026-11-05',source:'https://example.org'};
  assert.deepEqual(verifiedFeature({verification:{macos:proof}},'macos'),proof);
});

test('queue uses existing filters and local review statuses',async()=>{
  const {filterCatalog}=await import('../site/catalog.mjs');
  const candidates=[{id:'a',repo:'x/a',name:'Alpha',engine:'WebKit',platform:'macOS'},{id:'b',repo:'x/b',name:'Beta',engine:'Chromium',platform:'Windows'}];
  const {pending}=partitionCatalog([],candidates,[]);
  const reviews={a:{status:'testing',note:'useful'},b:{status:'new'}};
  const status=row=>reviews[row.id]?.status||'new';
  const filters={view:'testing',platform:'macOS',engine:'all',q:'useful',noteOf:row=>reviews[row.id]?.note||''};
  assert.deepEqual(filterCatalog(pending,{},filters,status).map(x=>x.id),['a']);
  assert.equal(reviews.a.note,'useful');
});
