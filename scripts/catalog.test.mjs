import test from "node:test";
import assert from "node:assert/strict";
import {matchesPlatform,matchesContributors,matchesDate,matchesLicense,licenseName,filterCatalog,sortCatalog} from "../site/catalog.mjs";

const browsers=[
  {id:"a",name:"A",repo:"org/a",platform:"macOS, Linux",engine:"Gecko",summary:"Firefox"},
  {id:"b",name:"B",repo:"org/b",platform:"macOS, Windows",engine:"Chromium",summary:"Chromium"},
  {id:"c",name:"C",repo:"org/c",platform:"Not verified",engine:"Unverified",summary:"Unknown"}
];
const metrics={
  "org/a":{stars:100,activeAuthors90d:2,licenseSpdx:"MPL-2.0",lastPush:"2026-10-01T00:00:00Z",firstReleaseAt:"2024-01-01T00:00:00Z",latestStableAt:"2026-10-01T00:00:00Z"},
  "org/b":{stars:300,activeAuthors90d:11,licenseSpdx:"GPL-3.0",lastPush:"2026-11-05T00:00:00Z",firstReleaseAt:"2026-08-01T00:00:00Z",latestStableAt:"2026-11-01T00:00:00Z"},
  "org/c":{stars:0,lastPush:"2026-11-05T00:00:00Z"}
};
const status=row=>row.id==="c"?"new":"unreviewed";
const base={view:"all",q:"",platform:"all",engine:"all",contributors:"all",license:"all",firstSince:"",stableSince:"",noteOf:()=>""};
const run=x=>filterCatalog(browsers,metrics,{...base,...x},status);

test("platform filter includes only explicitly confirmed platforms",()=>{
  assert.equal(matchesPlatform("macOS, Windows","Windows"),true);
  assert.equal(matchesPlatform("Linux coming soon","Linux"),false);
  assert.deepEqual(run({platform:"Windows"}).map(x=>x.id),["b"]);
  assert.deepEqual(run({platform:"Linux"}).map(x=>x.id),["a"]);
  assert.equal(run({platform:"all"}).length,3);
});
test("engine, authors, licence and independent date filters can be combined",()=>{
  assert.deepEqual(run({engine:"Chromium",platform:"Windows",contributors:"11+",license:"GPL",firstSince:"2026-07-01",stableSince:"2026-10-31"}).map(x=>x.id),["b"]);
  assert.deepEqual(run({contributors:"2-5"}).map(x=>x.id),["a"]);
  assert.deepEqual(run({contributors:"1"}),[]);
  assert.deepEqual(run({license:"unknown"}).map(x=>x.id),["c"]);
  assert.deepEqual(run({firstSince:"2026-01-01"}).map(x=>x.id),["b"]);
  assert.deepEqual(run({stableSince:"2026-11-01"}).map(x=>x.id),["b"]);
  assert.deepEqual(run({q:"Firefox"}).map(x=>x.id),["a"]);
  assert.equal(matchesContributors({}, "1"),false);
  assert.equal(matchesDate(null,"2025-01-01"),false);
  assert.equal(licenseName({licenseSpdx:"NOASSERTION"}),null);
  assert.equal(matchesLicense({licenseSpdx:"MIT"},"GPL"),false);
});
test("sorting by stars, last push, release dates, and contributors keeps unknown values last",()=>{
  assert.deepEqual(sortCatalog(browsers,metrics,"stars",status).map(x=>x.id),["b","a","c"]);
  assert.deepEqual(sortCatalog(browsers,metrics,"first-release-old",status).map(x=>x.id),["a","b","c"]);
  assert.deepEqual(sortCatalog(browsers,metrics,"latest-stable",status).map(x=>x.id),["b","a","c"]);
  assert.deepEqual(sortCatalog(browsers,metrics,"contributors",status).map(x=>x.id),["b","a","c"]);
  assert.deepEqual(sortCatalog(browsers,metrics,"priority",status).map(x=>x.id),["a","b","c"]);
});
