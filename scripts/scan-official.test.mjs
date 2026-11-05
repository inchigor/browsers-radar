import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import {htmlText,parseDia,parseOrion,run} from "./scan-official.mjs";
const dia='<html><h2>October 29, 2026</h2><p>Mac v1.55.0</p><h2>October 22, 2026</h2><p>Mac v1.54.0</p><h2>October 29, 2026</h2><p>Windows v1.4.0</p><script>November 30, 2029 Windows v999.9</script></html>';
const orion='<html><h1>Orion Browser macOS Release Notes</h1><h2>Orion 1.1 ✴︎ June 23, 2026</h2><h2>Orion RC 131.2 March 3, 2025</h2><h2>Orion 1.0 ✴︎ January 12, 2025</h2></html>';
test("parse official releases per platform",()=>{
 assert.deepEqual(parseDia(dia,"macOS"),{version:"1.55.0",publishedAt:"2026-10-29"});
 assert.deepEqual(parseDia(dia,"Windows"),{version:"1.4.0",publishedAt:"2026-10-29"});
 assert.deepEqual(parseOrion(orion),{version:"1.1",publishedAt:"2026-06-23"});
 assert.ok(!htmlText(dia).includes("999.9"));
});
test("unknown dates and release candidates are rejected",()=>{
 assert.throws(()=>parseDia("<h2>Oct 2026</h2>","macOS"),/not found/);
 assert.throws(()=>parseOrion("<h2>Orion RC 131.2 June 5, 2026</h2>"),/not found/);
 assert.throws(()=>parseDia(dia,"Linux"),/Unsupported/);
 assert.throws(()=>parseDia("<h2>February 30, 2026</h2>Mac v1.2.0","macOS"),/not found/);
});
async function fixture(t){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),"browser-official-test-"));
 t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const obj={schemaVersion:1,sources:{"official/dia":{checkedAt:null,releases:{macOS:{version:"1.54.0",publishedAt:"2026-10-22",url:"official"}}},"official/orion":{checkedAt:null,releases:{macOS:{version:"1.1",publishedAt:"2026-06-23",url:"official"}}}}};
 await fs.writeFile(path.join(dir,"official.json"),JSON.stringify(obj));
 return dir;
}
test("verified update preserves unrelated sources",async t=>{
 const dataDir=await fixture(t);
 const sources=[{id:"official/dia",platform:"macOS",kind:"dia",url:"https://www.diabrowser.com/changelog/mac"}];
 const result=await run({dataDir,now:"2026-11-05T18:00:00Z",sources,load:async()=>dia});
 assert.deepEqual(result,{successes:1,failures:0,status:"success"});
 const s=JSON.parse(await fs.readFile(path.join(dataDir,"official.json"),"utf8"));
 assert.equal(s.sources["official/dia"].releases.macOS.version,"1.55.0");
 assert.equal(s.sources["official/orion"].releases.macOS.version,"1.1");
});
test("partial failure retains last good data",async t=>{
 const dataDir=await fixture(t);
 const sources=[{id:"official/dia",platform:"macOS",kind:"dia",url:"https://www.diabrowser.com/changelog/mac"},{id:"official/orion",platform:"macOS",kind:"orion",url:"https://browser.kagi.com/updates/orion-release-notes.html"}];
 await run({dataDir,now:"2026-11-05T18:00:00Z",sources,load:async url=>url.includes("kagi")?Promise.reject(new Error("network")):dia});
 const s=JSON.parse(await fs.readFile(path.join(dataDir,"official.json"),"utf8"));
 assert.equal(s.status,"partial");
 assert.equal(s.sources["official/dia"].releases.macOS.version,"1.55.0");
 assert.equal(s.sources["official/orion"].releases.macOS.version,"1.1");
});
test("total failure leaves snapshots untouched",async t=>{
 const dataDir=await fixture(t);
 const sources=[{id:"official/dia",platform:"macOS",kind:"dia",url:"https://www.diabrowser.com/changelog/mac"}];
 await assert.rejects(run({dataDir,now:"2026-11-05T18:00:00Z",sources,load:async()=>"<html>none</html>"}),/No official/);
 const s=JSON.parse(await fs.readFile(path.join(dataDir,"official.json"),"utf8"));
 assert.equal(s.status,"failed");
 assert.equal(s.sources["official/dia"].releases.macOS.version,"1.54.0");
});
test("older and future releases never overwrite newer observations",async t=>{
 const dataDir=await fixture(t);
 const sources=[{id:"official/dia",platform:"macOS",kind:"dia",url:"https://www.diabrowser.com/changelog/mac"}];
 await assert.rejects(run({dataDir,now:"2026-11-05T18:00:00Z",sources,load:async()=>"<h2>October 1, 2026</h2><p>Mac v1.20.0</p>"}));
 await assert.rejects(run({dataDir,now:"2026-11-05T18:00:00Z",sources,load:async()=>"<h2>December 1, 2026</h2><p>Mac v100.0</p>"}));
 const s=JSON.parse(await fs.readFile(path.join(dataDir,"official.json"),"utf8"));
 assert.equal(s.sources["official/dia"].releases.macOS.version,"1.54.0");
});
