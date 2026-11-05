import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {LANGS,messages,translate,detectLanguage} from "../site/i18n.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const site=path.join(root,"site");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");

test("English and Russian translation keys match",()=>{
  assert.deepEqual(Object.keys(messages.en).sort(),Object.keys(messages.ru).sort());
  assert.deepEqual(LANGS,["en","ru"]);
  assert.equal(translate("en","status_new"),"New");
  assert.equal(translate("ru","status_new"),"Новый");
  assert.equal(translate("en","count",{shown:2,total:5}),"2 of 5 · Filter and take notes");
  assert.equal(detectLanguage(null,"ru-RU"),"ru");
  assert.equal(detectLanguage(null,"en-US"),"en");
  assert.equal(detectLanguage("en","ru-RU"),"en");
});
test("all HTML translation markers exist in both locales",()=>{
  const html=read("site/index.html");
  const keys=[...html.matchAll(/data-i18n(?:-placeholder|-title|-aria-label)?="([^"]+)"/g)].map(x=>x[1]);
  assert.ok(keys.length>=40);
  for(const key of keys)assert.ok(Object.hasOwn(messages.en,key)&&Object.hasOwn(messages.ru,key),"Missing translation: "+key);
  assert.ok(html.includes('id="language"'));
});
test("public site never packages a personal reviews file or legacy storage key",()=>{
  assert.equal(fs.existsSync(path.join(site,"data/reviews.json")),false);
  const app=read("site/app.js");
  assert.equal(app.includes('getJson("reviews.json")'),false);
  assert.equal(app.includes('"reviews.json","'),false);
  assert.equal(app.includes('const REVIEW_KEY = "browsers-radar-public-reviews-v1"'),true);
  assert.ok(!app.includes('"browser-radar-reviews-v1"'));
  const browsers=JSON.parse(read("site/data/browsers.json"));
  assert.ok(browsers.length>0);
  for(const browser of browsers){
    assert.equal(typeof browser.summary,"string");
    assert.equal(typeof browser.summaryRu,"string");
    assert.equal(Object.hasOwn(browser,"review"),false);
    assert.equal(Object.hasOwn(browser,"note"),false);
  }
});

test("official-only browsers have stable IDs, explicit sources and no private user data",()=>{
  const rows=JSON.parse(read("site/data/browsers.json"));
  const snapshots=JSON.parse(read("site/data/official.json"));
  for(const browser of rows.filter(row=>row.source==="official")){
    assert.equal(browser.repo,null);
    assert.equal(browser.sourceCode,"closed");
    assert.match(browser.id,/^official\/[a-z0-9-]+$/);
    assert.ok(browser.releaseNotesUrl?.startsWith("https://"));
    assert.ok(snapshots.sources[browser.id],"No snapshot: "+browser.id);
    for(const release of Object.values(snapshots.sources[browser.id].releases||{})){
      assert.match(release.publishedAt,/^\d{4}-\d{2}-\d{2}$/);
      assert.match(release.version,/^\d+(?:\.\d+)+$/);
      assert.equal(Object.hasOwn(release,"personalReview"),false);
    }
  }
  assert.equal(fs.existsSync(path.join(site,"data/reviews.json")),false);
  const app=read("site/app.js");
  assert.ok(app.includes("officialMetric"));
  assert.ok(app.includes('"browsers.json","discovered.json","metrics.json","official.json"'));
});
