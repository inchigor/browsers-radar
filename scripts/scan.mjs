#!/usr/bin/env node
/** Weekly discovery of potentially relevant desktop browsers. All results need human review. */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isExcludedBrowser } from "../site/excluded.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "site", "data");
const API = "https://api.github.com";
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const MAX_NEW_PER_RUN = 8;
const QUERIES = [
  '"arc browser" alternative in:name,description,readme archived:false',
  '"vertical tabs" browser macos in:description,readme archived:false',
  '"vertical tabs" browser windows in:description,readme archived:false',
  '"vertical tabs" browser linux in:description,readme archived:false',
  'browser sidebar swift macos in:description,readme archived:false',
  'browser webkit macos in:description,readme archived:false',
  '"chromium browser" macos in:description,readme archived:false',
  '"chromium browser" windows linux in:description,readme archived:false'
];

function isJunkName(name) {
  return /(unlocked|crack(?:ed)?|keygen|full[-_ ]?version|history[-_ ]?timeline|browser[-_ ]?history|free[-_ ]?download)/i.test(String(name));
}
export function looksRelevant(repo) {
  if (!repo || repo.archived || repo.fork || repo.size === 0 || !repo.full_name || isExcludedBrowser(repo.full_name)) return false;
  const name = String(repo.name || "").toLowerCase();
  if (!String(repo.description || "").trim()) return false;
  if (/(desktop[-_]?web[-_]?browsers|browser[-_]?lists?|browser[-_]?directories)/i.test(name)) return false;
  if (isJunkName(name)) return false;
  const text = `${name} ${repo.description || ""}`.toLowerCase();
  if (/(awesome|extension|theme|wallpaper|template|starter|bookmarklet|config|dotfiles|crawler|scraper|agent|mcp|sdk|react component)/i.test(name)) return false;
  if (!/(browser|браузер)/i.test(text)) return false;
  // Exclude tools that only integrate with existing browsers.
  if (/(terminal|input.method|(?:^|[^a-z])ime(?:[^a-z]|$)|browser.?cli|cross.browser|browser per tab|browser extension|reuse existing browser tabs|no embedded browser|web automation|browser agent)/i.test(text)) return false;
  // Exclude projects that mention browsers but serve a different purpose.
  if (/(?:browser automation|browser integration|browser engine|running in (?:the|a) browser|runs in (?:the|a) browser|setup guide|privacy setup|migration|migrate|import (?:reset|bookmarks|history)|look and behave like|browser profile|connect your browser|download manager|(?:ios|android)[- ](?:only|browser))/i.test(text)) return false;
  if (/\b(?:ios|android)\b/i.test(text) && !/\b(?:macos|mac os|windows|linux|desktop)\b/i.test(text)) return false;
  // Require affirmative evidence that the project itself is a desktop browser.
  return /\b(?:web|desktop|chromium|webkit|gecko|firefox|macos|windows|linux|electron|swift|native|open.source|private|minimal|keyboard.driven)\b(?:[ -]+[a-z0-9]+){0,3}[ -]+browser\b|\bbrowser\s+(?:for\s+(?:macos|mac os|windows|linux|desktop)|(?:built|based)\s+(?:on|with|using)|with\s+(?:vertical tabs|sidebar|tabs|extensions))\b/i.test(text);

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
// First release = earliest published GitHub Release, not first commit/tag.
// If pagination is incomplete, firstReleaseAt stays null rather than guessing.
const MAX_RELEASE_PAGES = 6;
export function summarizeReleases(releases, complete) {
  const published=releases.filter(x=>!x.draft && x.published_at && !Number.isNaN(Date.parse(x.published_at)));
  published.sort((a,b)=>Date.parse(b.published_at)-Date.parse(a.published_at));
  // GitHub's prerelease flag is authoritative; tag markers are a conservative extra guard.
  const stable=published.filter(x=>!x.prerelease && !/(?:^|[.-])(alpha|beta|rc|dev|nightly|preview)(?:[.-]|\d|$)/i.test(x.tag_name||""));
  return {
    latestRelease:published[0]?.tag_name||null,
    lastReleaseAt:published[0]?.published_at||null,
    latestStableTag:stable[0]?.tag_name||null,
    latestStableAt:stable[0]?.published_at||null,
    firstReleaseAt:complete && published.length?published.at(-1).published_at:null,
    releaseHistoryComplete:complete
  };
}
async function getMetrics(repo,since,request){
  const p=encodeURIComponent(repo).replace("%2F","/");
  const basic=await request("/repos/"+p);
  const metric={
    stars:basic.stargazers_count??0,lastPush:basic.pushed_at||null,
    archived:!!basic.archived,githubCreatedAt:basic.created_at||null,
    licenseSpdx:basic.license?.spdx_id||null,
    latestRelease:null,lastReleaseAt:null,latestStableTag:null,latestStableAt:null,
    firstReleaseAt:null,releaseHistoryComplete:false,
    activeAuthors90d:0,commitsSample:0,commitsTruncated:false
  };
  const releases=[];
  let complete=false;
  for(let page=1;page<=MAX_RELEASE_PAGES;page++){
    let batch;
    try{batch=await request("/repos/"+p+"/releases?per_page=100&page="+page);}
    catch(e){if(page===1 && /GitHub API 404(?:\s|$)/.test(e.message)){complete=true;break;}throw e;}
    if(!Array.isArray(batch))throw new Error("Unexpected releases API response");
    releases.push(...batch);
    if(batch.length<100){complete=true;break;}
  }
  Object.assign(metric,summarizeReleases(releases,complete));
  const commits=await request("/repos/"+p+"/commits?since="+encodeURIComponent(since)+"&per_page=100");
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
  const targets=[...new Map([...curated.map(x=>x.repo),...candidates.filter(x=>!isExcludedBrowser(x.repo||x.id)).slice(-12).map(x=>x.repo)].filter(Boolean).map(repo=>[repoKey(repo),repo])).values()];
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
