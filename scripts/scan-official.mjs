#!/usr/bin/env node
// Official release notes for browsers without public GitHub source repositories.
// This script tracks published release announcements, not git commits, team size,
// or "stable" channel status. No third-party packages or accounts required.
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const DATA=path.join(ROOT,"site","data");
const MONTH="January|February|March|April|May|June|July|August|September|October|November|December";
export const SOURCES=[
  {id:"official/dia",platform:"macOS",kind:"dia",url:"https://www.diabrowser.com/changelog/mac"},
  {id:"official/dia",platform:"Windows",kind:"dia",url:"https://www.diabrowser.com/changelog/windows"},
  {id:"official/orion",platform:"macOS",kind:"orion",url:"https://browser.kagi.com/updates/orion-release-notes.html"}
];
function unescapeHtml(s){
  return String(s).replace(/&(?:nbsp|amp|lt|gt|quot|apos|#39|#x27);/gi,m=>({
    "&nbsp;":" ","&amp;":"&","&lt;":"<","&gt;":">","&quot;":'"',"&apos;":"'","&#39;":"'","&#x27;":"'"
  })[m.toLowerCase()]||m);
}
export function htmlText(html){
  return unescapeHtml(String(html)
    .replace(/<(script|style|svg|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi," ")
    .replace(/<[^>]+>/g," ")
    .replace(/\s+/g," ").trim());
}
function isoDate(month,day,year){
  const ms=Date.parse(month+" "+day+", "+year+" 12:00:00 UTC");
  if(!Number.isFinite(ms))return null;
  const value=new Date(ms).toISOString().slice(0,10);
  const check=new Date(ms);
  // Reject invalid calendar dates auto-corrected by Date.parse.
  if(check.getUTCDate()!==Number(day)||check.getUTCFullYear()!==Number(year))return null;
  return value;
}
export function parseDia(html,platform){
  if(!["macOS","Windows"].includes(platform))throw new Error("Unsupported Dia platform");
  const text=htmlText(html);
  const dates=[...text.matchAll(new RegExp("\\b("+MONTH+")\\s+(\\d{1,2}),\\s*(20\\d{2})\\b","gi"))];
  const target=platform==="macOS"?"Mac":"Windows";
  const versionRe=new RegExp("\\b"+target+"\\s+v(\\d+\\.\\d+(?:\\.\\d+){0,2}(?:[-.](?:alpha|beta|rc)\\.?\\d+)?)\\b","i");
  let best=null;
  for(let i=0;i<dates.length;i++){
    const d=dates[i],publishedAt=isoDate(d[1],d[2],d[3]);
    if(!publishedAt)continue;
    const chunk=text.slice(d.index+d[0].length,Math.min(dates[i+1]?.index??text.length,d.index+1250));
    const v=chunk.match(versionRe);
    if(!v)continue;
    const candidate={version:v[1],publishedAt};
    if(!best||candidate.publishedAt>best.publishedAt)best=candidate;
  }
  if(!best)throw new Error("Dia release entry not found");
  return best;
}
export function parseOrion(html){
  const heading=[...String(html).matchAll(/<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]\s*>/gi)]
    .map(m=>htmlText(m[1]));
  const lines=heading.length?heading:[htmlText(html)];
  const re=new RegExp("\\bOrion\\s+(\\d+\\.\\d+(?:\\.\\d+){0,2})\\s*[^\\w]{0,12}\\s*("+MONTH+")\\s+(\\d{1,2}),?\\s*(20\\d{2})\\b","i");
  let best=null;
  for(const line of lines){
    const m=line.match(re);
    if(!m)continue;
    const publishedAt=isoDate(m[2],m[3],m[4]);
    if(!publishedAt)continue;
    const candidate={version:m[1],publishedAt};
    if(!best||publishedAt>best.publishedAt)best=candidate;
  }
  if(!best)throw new Error("Orion release entry not found");
  return best;
}
export async function fetchHtml(url){
  const response=await fetch(url,{headers:{"User-Agent":"BrowserRadar/0.2 (+public release monitoring)","Accept":"text/html"},signal:AbortSignal.timeout(18000)});
  if(!response.ok)throw new Error("Official source HTTP "+response.status);
  const type=response.headers.get("content-type")||"";
  if(!type.includes("html"))throw new Error("Official source is not HTML");
  const html=await response.text();
  if(html.length>5_000_000)throw new Error("Official source too large");
  return html;
}
const parse=(html,source)=>source.kind==="dia"?parseDia(html,source.platform):parseOrion(html);
export async function run({dataDir=DATA,load=fetchHtml,now=new Date().toISOString(),sources=SOURCES}={}){
  const file=path.join(dataDir,"official.json");
  const previous=JSON.parse(await fs.readFile(file,"utf8"));
  const next=structuredClone(previous);
  let successes=0,failures=0;
  for(const source of sources){
    const item=next.sources[source.id];
    if(!item)throw new Error("Official source id not configured: "+source.id);
    try{
      const page=await load(source.url);
      let release;
      try{release=parse(page,source);}
      catch(err){
        if(source.kind==="dia"){
          const plain=htmlText(page);
          console.warn("Dia diagnostics "+source.platform+
            ": html="+page.length+" clean="+plain.length+
            " sample="+JSON.stringify(plain.slice(0,720))+
            " dates="+JSON.stringify((plain.match(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,\s*\d{4})?/gi)||[]).slice(0,6))+
            " versions="+JSON.stringify((plain.match(/\b(?:Mac|Windows)\s+v\d+(?:\.\d+){1,3}/gi)||[]).slice(0,6)));
        }
        throw err;
      }
      if(Date.parse(release.publishedAt)>Date.parse(now)+86400000)throw new Error("Future release date");
      const old=item.releases[source.platform];
      if(old?.publishedAt&&release.publishedAt<old.publishedAt)throw new Error("Official page contains older release");
      const slug=release.version.replace(/\./g,"-");
      const releaseUrl=source.kind==="dia"?"https://www.diabrowser.com/changelog/"+(source.platform==="macOS"?"mac":"windows")+"/"+slug:source.url;
      item.releases[source.platform]={...release,url:releaseUrl,origin:"official-auto"};
      item.checkedAt=now;
      successes++;
      console.log("Official "+source.id+" "+source.platform+": "+release.version+" ("+release.publishedAt+")");
    }catch(err){
      failures++;
      console.warn("Official "+source.id+" "+source.platform+" unavailable: "+String(err?.message||err).slice(0,160));
    }
  }
  next.attemptedAt=now;
  next.status=successes===0?"failed":failures?"partial":"success";
  next.sourceSuccesses=successes;
  next.sourceFailures=failures;
  // Do not replace last known good release on a failed or outdated source.
  await fs.writeFile(file,JSON.stringify(next,null,2)+"\n","utf8");
  if(successes===0)throw new Error("No official release source could be verified");
  return {successes,failures,status:next.status};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  run().catch(err=>{console.error(err);process.exitCode=1;});
}
