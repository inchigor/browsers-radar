import test from 'node:test';
import assert from 'node:assert/strict';
import {looksRelevant,normalizeCandidate,distinctContributors,summarizeReleases} from './scan.mjs';

test('reject unrelated GitHub resources and forks',()=>{
  assert.equal(looksRelevant({name:'awesome-browser-list',description:'browser links',full_name:'x/awesome-browser-list'}),false);
  assert.equal(looksRelevant({name:'my-browser',description:'macOS',full_name:'x/my-browser',fork:true}),false);
  assert.equal(looksRelevant({name:'duck-browser',description:'macOS WebKit Browser',full_name:'x/duck-browser',size:0}),false);
  assert.equal(looksRelevant({name:'movie-player',description:'video and audio',full_name:'x/movie-player'}),false);
  assert.equal(looksRelevant({name:'desktop-web-browsers',description:null,full_name:'x/desktop-web-browsers'}),false);
  assert.equal(looksRelevant({name:'desktop-web-browsers',description:'List of macOS browsers',full_name:'x/desktop-web-browsers'}),false);
  for (const [name,description] of [
    ['smart-terminal','Native macOS terminal, a browser per tab'],
    ['openviet-ime','Cross-browser Vietnamese IME for Chromium'],
    ['browser-cli','A CLI for your macOS browser'],
    ['Bern','Rust native UI; no embedded browser'],
    ['link-reuse','Reuse existing browser tabs for external links on macOS']
  ]) assert.equal(looksRelevant({name,description,full_name:'x/'+name}),false,name);
});
test('accept candidate without claiming verified features',()=>{
  const repo={name:'ArcLikeBrowser',description:'Swift browser with vertical tabs for macOS',full_name:'org/ArcLikeBrowser',homepage:'https://example.org'};
  assert.equal(looksRelevant(repo),true);
  const candidate=normalizeCandidate(repo,'2026-11-05T10:00:00Z');
  assert.equal(candidate.engine,'Unverified');
  assert.equal(candidate.id,'org/ArcLikeBrowser');
});
test('count unique non-bot contributors',()=>{
  const authors=[{author:{login:'alice'}},{author:{login:'alice'}},{author:{login:'bob'}},{author:{login:'dependabot[bot]'}}];
  assert.equal(distinctContributors(authors),2);
});

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {run} from './scan.mjs';
import {countActiveProjects, metricFreshness} from '../site/metrics.mjs';

const now='2026-11-05T12:00:00.000Z';
async function fixture(t, candidates=[]) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'browser-radar-test-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  for(const [name,data] of Object.entries({
    'browsers.json':[{id:'known/browser',repo:'known/browser'}],
    'discovered.json':{scannedAt:'2026-10-01T00:00:00Z',candidates},
    'metrics.json':{scannedAt:'2026-10-01T00:00:00Z',repos:{'known/browser':{stars:42,lastPush:'2026-09-01T00:00:00Z'}}}
  }))await fs.writeFile(path.join(dir,name),JSON.stringify(data));
  return dir;
}
const load=async (dir,name)=>JSON.parse(await fs.readFile(path.join(dir,name),'utf8'));
const searchRepo=(name)=>({full_name:name,name:name.split('/')[1],description:'macOS browser with vertical tabs'});
function fakeApi({items=[],failSearch=false,failMetrics=false,failCommits=false}={}) {
  return async uri=>{
    if(uri.startsWith('/search/')) {if(failSearch)throw new Error('offline');return {items};}
    if(failMetrics)throw new Error('offline');
    if(uri.includes('/releases?'))return [];
    if(uri.includes('/commits?')){if(failCommits)throw new Error('offline');return [];}
    return {stargazers_count:10,pushed_at:'2026-11-01T00:00:00Z'};
  };
}
test('preserves all previous candidates without applying new filters or a size cap and avoids new duplicates',async t=>{
  const old=Array.from({length:101},(_,i)=>({id:`Old/browser${i}`,repo:`Old/browser${i}`,name:i===0?'cracked-browser':`browser${i}`}));
  const dir=await fixture(t,old);
  await run({dataDir:dir,now,request:fakeApi({items:[searchRepo('old/BROWSER1'),searchRepo('KNOWN/browser'),searchRepo('new/browser'),searchRepo('NEW/BROWSER')]})});
  const data=await load(dir,'discovered.json');
  assert.deepEqual(data.candidates.slice(0,old.length),old);
  assert.equal(data.candidates.length,102);
  assert.equal(data.candidates.at(-1).id.toLowerCase(),'new/browser');
  assert.equal(data.status,'success');
});
test('total API failure keeps previous data, records failure and rejects',async t=>{
  const old=[{id:'old/browser',repo:'old/browser',name:'old'}];
  const dir=await fixture(t,old);
  const before=await fs.readFile(path.join(dir,'metrics.json'),'utf8');
  await assert.rejects(run({dataDir:dir,now,request:fakeApi({failSearch:true,failMetrics:true})}),/no search or metric updates succeeded/);
  const data=await load(dir,'discovered.json');
  assert.deepEqual(data.candidates,old);
  assert.equal(data.scannedAt,'2026-10-01T00:00:00Z');
  assert.equal(data.attemptedAt,now);
  assert.equal(data.status,'failed');
  assert.equal(await fs.readFile(path.join(dir,'metrics.json'),'utf8'),before);
});
test('partial search and metric failures are recorded without replacing old metrics',async t=>{
  const dir=await fixture(t);
  await run({dataDir:dir,now,request:fakeApi({failSearch:true})});
  let data=await load(dir,'discovered.json');
  assert.equal(data.status,'partial'); assert.equal(data.searchFailures,8);
  assert.equal(data.scannedAt,'2026-10-01T00:00:00Z');
  assert.equal((await load(dir,'metrics.json')).repos['known/browser'].updatedAt,now);
  await run({dataDir:dir,now,request:fakeApi({failCommits:true})});
  data=await load(dir,'discovered.json');
  assert.equal(data.status,'partial'); assert.equal(data.metricFailures,1);
  assert.equal((await load(dir,'metrics.json')).repos['known/browser'].updatedAt,now);
});
test('active count excludes absent repositories and freshness is per repository',()=>{
  const date=Date.parse(now);
  const metrics={a:{lastPush:'2026-11-01T00:00:00Z',updatedAt:now},b:{lastPush:'2026-11-02T00:00:00Z'},c:{lastPush:'2026-01-01T00:00:00Z'}};
  assert.equal(countActiveProjects([{repo:'a'},{repo:'a'},{repo:'c'}],metrics,date),1);
  assert.equal(metricFreshness(metrics.a,date),'fresh');
  assert.equal(metricFreshness(metrics.b,date),'unknown');
  assert.equal(metricFreshness({updatedAt:'2026-10-01T00:00:00Z'},date),'stale');
});

test('release history distinguishes first public release from latest non-prerelease',()=>{
  const data=summarizeReleases([
    {tag_name:'v2.0.0-beta.1',published_at:'2026-11-05T00:00:00Z',prerelease:true,draft:false},
    {tag_name:'v1.5.0',published_at:'2026-10-20T00:00:00Z',prerelease:false,draft:false},
    {tag_name:'v1.0.0',published_at:'2025-09-01T00:00:00Z',prerelease:false,draft:false},
    {tag_name:'v3.0.0',published_at:'2026-11-06T00:00:00Z',prerelease:false,draft:true}
  ],true);
  assert.equal(data.latestRelease,'v2.0.0-beta.1');
  assert.equal(data.latestStableTag,'v1.5.0');
  assert.equal(data.latestStableAt,'2026-10-20T00:00:00Z');
  assert.equal(data.firstReleaseAt,'2025-09-01T00:00:00Z');
  assert.equal(summarizeReleases([{tag_name:'v1.0.0',published_at:'2025-01-01T00:00:00Z'}],false).firstReleaseAt,null);
  assert.equal(summarizeReleases([],true).firstReleaseAt,null);
});
test('prerelease-tag guard handles mislabelled beta releases',()=>{
  const data=summarizeReleases([
    {tag_name:'v3.0.0-rc.1',published_at:'2026-11-04T00:00:00Z',prerelease:false},
    {tag_name:'v2.9.0',published_at:'2026-10-01T00:00:00Z',prerelease:false}
  ],true);
  assert.equal(data.latestStableTag,'v2.9.0');
});

test('reject non-browser integrations, tools, engines and mobile-only apps',()=>{
  for (const [name,description] of [
    ['browser2zen','Private browser2zen with profile-aware Arc migration and fresh import reset'],
    ['firefox-zen','Make Firefox look and behave like Zen Browser on macOS'],
    ['Brave-Private-Browsing-Setup','Brave Browser Windows 11 Privacy Setup Guide 2026'],
    ['fourdock-macos','Experimental macOS workspace for WhatsApp using a dedicated full-browser profile'],
    ['WebKit','Home of the WebKit project, the browser engine used by Safari on macOS'],
    ['risc-os','A recreation of the RISC OS desktop running in the browser'],
    ['auto-deal-researcher','Beta release with LLM integration and browser automation'],
    ['MediaGrab','A native Linux download manager with video capture and browser integration'],
    ['roko-browser','roko: a fast, private iOS browser in the spirit of Arc Search'],
    ['mobile-browser','A Chromium browser for Android'],
    ['opendia','Connect your browser to AI models. Just use Dia on Chrome']
  ]) assert.equal(looksRelevant({name,description,full_name:'example/'+name}),false,name);
});
test('accept plausible desktop browser descriptions without asserting compatibility',()=>{
  for(const [name,description] of [
    ['Paddle','Personal macOS WebKit browser'],
    ['vane','Open-source native macOS browser with sidebar tabs'],
    ['koan','A Zen-style browser built on Chromium'],
    ['omaweb','A keyboard-driven web browser with vertical tabs'],
    ['Aegis','A privacy-first Chromium browser for Windows and Linux']
  ]) assert.equal(looksRelevant({name,description,full_name:'example/'+name}),true,name);
});
test('manually excluded IDs stay excluded case-insensitively',async()=>{
  const {isExcludedBrowser}=await import('../site/excluded.mjs');
  assert.equal(isExcludedBrowser('WebKit/WebKit'),true);
  assert.equal(isExcludedBrowser('unknown/browser'),false);
  assert.equal(looksRelevant({name:'browser',description:'native macOS browser',full_name:'WebKit/WebKit'}),false);
});
