#!/usr/bin/env node
/** Weekly discovery of potentially relevant desktop browsers. All results need human review. */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "site", "data");
const API = "https://api.github.com";
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const MAX_NEW_PER_RUN = 8;
const QUERIES = [
  '"arc browser" alternative in:name,description,readme archived:false',
  '"vertical tabs" browser macos in:description,readme archived:false',
  'browser sidebar swift macos in:description,readme archived:false',
  'browser webkit macos in:description,readme archived:false',
  '"chromium browser" macos in:description,readme archived:false'
];

function isJunkName(name) {
  return /(unlocked|crack(?:ed)?|keygen|full[-_ ]?version|history[-_ ]?timeline|browser[-_ ]?history|free[-_ ]?download)/i.test(String(name));
}
export function looksRelevant(repo) {
  if (!repo || repo.archived || repo.fork || !repo.full_name) return false;
  const name = String(repo.name || "").toLowerCase();
  if (isJunkName(name)) return false;
  const text = `${name} ${repo.description || ""}`.toLowerCase();
  if (/(awesome|extension|theme|wallpaper|template|starter|bookmarklet|config|dotfiles|crawler|scraper|agent|mcp|sdk|react component)/i.test(name)) return false;
  if (!/(browser|браузер)/i.test(text)) return false;
  // Exclude tools that only integrate with existing browsers.
  if (/(terminal|input.method|(?:^|[^a-z])ime(?:[^a-z]|$)|browser.?cli|cross.browser|browser per tab|browser extension|reuse existing browser tabs|no embedded browser|web automation|browser agent)/i.test(text)) return false;
  // Relevance is only a candidate heuristic, not proof of platform compatibility.
  return /(arc|vertical|sidebar|swift|macos|mac os|chromium|firefox|webkit|gecko)/i.test(text);
}
export function normalizeCandidate(repo, now) {
  return {
    id: repo.full_name,
    name: repo.name,
    engine: "Unverified",
    platform: "Not verified",
    url: repo.homepage?.startsWith("https://") ? repo.homepage : null,
    repo: repo.full_name,
    summary: repo.description || "New GitHub discovery. Platform, releases and extensions need independent verification.",
    discoveredAt: now
  };
}
export function distinctContributors(commits) {
  const authors = new Set();
  for(const c of commits){
    const author = c?.author?.login || c?.commit?.author?.email || c?.commit?.author?.name;
    if(!author || /\[bot\]|dependabot|github-actions|renovate/i.test(String(author)))continue;
    authors.add(String(author).toLowerCase());
  }
  return authors.size;
}
async function api(uri){
  const resp=await fetch(`${API}${uri}`, {headers:{"Accept":"application/vnd.github+json","User-Agent":"BrowserRadar/0.1","X-GitHub-Api-Version":"2022-11-28",...(TOKEN?{"Authorization":`Bearer ${TOKEN}`}:{})},signal:AbortSignal.timeout(20000)});
  if(!resp.ok){let msg=await resp.text();throw new Error(`GitHub API ${resp.status} ${uri.split("?")[0]}: ${msg.slice(0,180)}`);}
  return resp.json();
}
async function read(dataDir,file){return JSON.parse(await fs.readFile(path.join(dataDir,file),"utf8"));}
async function write(dataDir,file,data){await fs.writeFile(path.join(dataDir,file),JSON.stringify(data,null,2)+"\n","utf8");}
async function getMetrics(repo,since,request){
  const p=encodeURIComponent(repo).replace("%2F","/");
  const basic=await request(`/repos/${p}`);
  const metric={stars:basic.stargazers_count||0,lastPush:basic.pushed_at||null,archived:!!basic.archived,latestRelease:null,lastReleaseAt:null,activeAuthors90d:0,commitsSample:0,commitsTruncated:false};
  try {const release=await request(`/repos/${p}/releases/latest`);metric.latestRelease=release.tag_name||null;metric.lastReleaseAt=release.published_at||null;}catch(e){if(!/GitHub API 404(?:\s|$)/.test(e.message))throw e;}
  const commits=await request(`/repos/${p}/commits?since=${encodeURIComponent(since)}&per_page=100`);
  metric.activeAuthors90d=distinctContributors(commits);
  metric.commitsSample=commits.length;
  metric.commitsTruncated=commits.length===100;
  return metric;
}
const repoKey = value => String(value || "").toLowerCase();
export async function run({dataDir=DATA,request=api,now=new Date().toISOString()}={}) {
  const since=new Date(Date.parse(now)-90*86400000).toISOString();
  const curated=await read(dataDir,"browsers.json");
  const old=await read(dataDir,"discovered.json");
  const oldMetrics=await read(dataDir,"metrics.json");
  // Preserve every existing record, even if current filters would reject it.
  const candidates=[...(old.candidates||[])];
  const known=new Set([...curated,...candidates].flatMap(row=>[row.id,row.repo]).filter(Boolean).map(repoKey));
  const seen=new Map();
  let searchSuccesses=0, searchFailures=0, metricSuccesses=0, metricFailures=0;
  for(const q of QUERIES){
    try{
      const url=`/search/repositories?q=${encodeURIComponent(q)}&sort=updated&order=desc&per_page=20`;
      const result=await request(url);
      if(!Array.isArray(result.items) || result.incomplete_results)throw new Error("Incomplete search result");
      searchSuccesses++;
      for(const repo of result.items)if(looksRelevant(repo))seen.set(repoKey(repo.full_name),repo);
      console.log(`Query: ${q}, returned ${result.items.length}`);
    }catch(e){searchFailures++;console.warn(`Search failed: ${e.message}`);}
  }
  let added=0;
  for(const [key,repo] of seen){
    if(known.has(key)||added>=MAX_NEW_PER_RUN)continue;
    candidates.push(normalizeCandidate(repo,now));known.add(key);added++;
  }
  const metrics={...(oldMetrics.repos||{})};
  const targets=[...new Map([...curated.map(x=>x.repo),...candidates.slice(-12).map(x=>x.repo)].filter(Boolean).map(repo=>[repoKey(repo),repo])).values()];
  for(const repo of targets){
    try{metrics[repo]={...await getMetrics(repo,since,request),updatedAt:now};metricSuccesses++;console.log(`Metrics: ${repo}`);}
    catch(e){metricFailures++;console.warn(`Skipped ${repo}: ${e.message}`);}
  }
  const failed=searchSuccesses===0 && metricSuccesses===0;
  const status=failed?"failed":searchFailures||metricFailures?"partial":"success";
  const result={...old,attemptedAt:now,status,searchFailures,metricFailures};
  if(searchSuccesses){result.scannedAt=now;result.queries=QUERIES;result.candidates=candidates;}
  const metricResult={...oldMetrics,repos:metrics};
  if(metricSuccesses)metricResult.scannedAt=now;
  // On total failure retain the previous data and only record the failed attempt.
  await write(dataDir,"discovered.json",result);
  if(metricSuccesses)await write(dataDir,"metrics.json",metricResult);
  console.log(`Scan ${status}: added ${added} candidates; ${searchFailures} search and ${metricFailures} metric failures.`);
  if(failed)throw new Error("GitHub API unavailable: no search or metric updates succeeded");
  return {status,searchFailures,metricFailures};
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  run().catch(e=>{console.error(e);process.exitCode=1;});
}
