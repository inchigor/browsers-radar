import {countActiveProjects, metricFreshness} from "./metrics.mjs";
import {parseReviews, compareReviews, storeImportedReviews} from "./reviews.mjs";
import {translate, detectLanguage} from "./i18n.mjs";
import {filterCatalog,sortCatalog,licenseName} from "./catalog.mjs";
import {officialMetric} from "./official.mjs";

const API_ROOT = "./data/";
// Different key from the original private site. Both GitHub Pages sites share one origin.
const REVIEW_KEY = "browsers-radar-public-reviews-v1";
const LANGUAGE_KEY = "browsers-radar-language-v1";
const STATUS = ["primary", "secondary", "testing", "checked", "watch", "rejected", "new", "unreviewed"];
const PRIORITY = ["primary", "secondary", "testing", "unreviewed", "new", "watch", "checked", "rejected"];
const $ = selector => document.querySelector(selector);
const node = (tag, className, content) => {
  const el=document.createElement(tag);
  if(className)el.className=className;
  if(content!==undefined)el.textContent=String(content);
  return el;
};
function stored(key) {
  try{return localStorage.getItem(key);}catch{return null;}
}
const state={
  browsers:[], metrics:{}, reviews:{}, view:"all", q:"", engine:"all",
  platform:"all", source:"all", contributors:"all", license:"all", firstSince:"", stableSince:"",
  sort:"priority", editing:null, scannedAt:null, scanStatus:null, loaded:false, imported:false,
  lang:detectLanguage(stored(LANGUAGE_KEY),navigator.language)
};
const t=(key,vars)=>translate(state.lang,key,vars);
const dateFmt=value=>value?new Date(value).toLocaleDateString(state.lang==="ru"?"ru-RU":"en-US",{year:"numeric",month:"short",day:"numeric"}):"—";
const timeValue=value=>value?Date.parse(value)||0:0;
const reviewOf=row=>state.reviews[row.id]||{};
const statusOf=row=>reviewOf(row).status||(row.discoveredAt?"new":"unreviewed");
const noteOf=row=>reviewOf(row).note||"";
function engineLabel(value) {
  return value==="Не проверен"||value==="Unverified"?t("unverifiedEngine"):value||t("unverifiedEngine");
}
function platformLabel(value) {
  return value==="Не проверено"||value==="Not verified"?t("unverifiedPlatform"):value||t("unverifiedPlatform");
}
function localizedError(err) {
  const msg=String(err?.message||"");
  if(msg.includes("другой вкладке"))return t("changedError");
  if(state.lang==="ru")return msg||t("importError");
  if(msg.includes("JSON"))return t("errJson");
  if(msg.includes("Файл должен"))return t("errShape");
  if(msg.includes("Некорректная запись"))return t("errEntry");
  if(msg.includes("Недопустимый статус"))return t("errStatus");
  if(msg.includes("Некорректные данные"))return t("errData");
  if(msg.includes("Не выбран способ"))return t("errPolicy");
  return t("importError");
}
function renderStatusOptions() {
  const previous=$("#review-status").value;
  $("#review-status").replaceChildren(...STATUS.map(key=>{
    const option=node("option","",t("status_"+key));option.value=key;return option;
  }));
  if(STATUS.includes(previous))$("#review-status").value=previous;
}
function applyLanguage() {
  document.documentElement.lang=state.lang;
  $("#language").value=state.lang;
  document.querySelectorAll("[data-i18n]").forEach(el=>{el.textContent=t(el.dataset.i18n);});
  for(const [dataName,property] of [["i18nPlaceholder","placeholder"],["i18nTitle","title"],["i18nAriaLabel","aria-label"]]){
    document.querySelectorAll("[data-"+dataName.replace(/[A-Z]/g,ch=>"-"+ch.toLowerCase())+"]").forEach(el=>{
      const value=t(el.dataset[dataName]);
      if(property==="aria-label")el.setAttribute(property,value);
      else el[property]=value;
    });
  }
  renderStatusOptions();
  if(state.imported)$("#local-hint").textContent=t("imported");
  if(state.loaded)render();
}
function addMetric(box,text,muted=false){box.append(node("span","metric"+(muted?" muted":""),text));}
function external(label,url) {
  const a=node("a","",label);a.href=url;a.target="_blank";a.rel="noopener noreferrer";return a;
}
function buildCard(browser) {
  const metric=state.metrics[browser.repo||browser.id]||{};
  const status=statusOf(browser);
  const card=node("article","browser-card");
  const top=node("div","card-top");
  const titleWrap=node("div","title-wrap");
  titleWrap.append(node("span","app-avatar",browser.name.slice(0,1).toUpperCase()));
  const names=node("div");
  names.append(node("h3","",browser.name),node("div","subheading",engineLabel(browser.engine)+" · "+platformLabel(browser.platform)));
  titleWrap.append(names);
  top.append(titleWrap,node("span","status "+status,t("status_"+status)));
  card.append(top);
  const description=state.lang==="ru"?(browser.summaryRu||browser.summary):(browser.summary||browser.summaryRu);
  card.append(node("p","summary",description||t("unknownSummary")));
  if(browser.lifecycle==="sunsetting")card.append(node("div","lifecycle-warning",t("sunsetting",{date:dateFmt(browser.sunsetDate)})));
  const badges=node("div","metrics");
  const pop=(key,value,muted=false)=>addMetric(badges,t(key)+": "+(value||"—"),muted);
  if(metric.stars!==undefined)addMetric(badges,"★ "+Number(metric.stars).toLocaleString(state.lang==="ru"?"ru-RU":"en-US"));
  if(metric.official){
    pop("metricLicense",licenseName(metric,browser.sourceCode));
    for(const [platform,release] of Object.entries(metric.releasesByPlatform||{})){
      if(!release?.version||!release?.publishedAt)continue;
      addMetric(badges,platform+": "+release.version+" · "+dateFmt(release.publishedAt));
    }
    if(metric.sourceCheckedAt)pop("metricSourceChecked",dateFmt(metric.sourceCheckedAt),true);
    else addMetric(badges,t("metricManualSource"),true);
  }else if(Object.keys(metric).length){
    pop("metricLicense",licenseName(metric));
    if(metric.lastPush)pop("metricLastUpdated",dateFmt(metric.lastPush));
    pop("metricFirstRelease",metric.firstReleaseAt?dateFmt(metric.firstReleaseAt):null);
    pop("metricStable",metric.latestStableAt?dateFmt(metric.latestStableAt)+(metric.latestStableTag?" ("+metric.latestStableTag+")":""):null);
    if(metric.activeAuthors90d!==undefined)pop("metricAuthors",String(metric.activeAuthors90d)+(metric.commitsTruncated?"+":""),true);
    const freshness=metricFreshness(metric);
    if(freshness==="stale")pop("metricUpdated",dateFmt(metric.updatedAt),true);
    if(freshness==="unknown")addMetric(badges,t("metricUnknown"),true);
  }
  if(browser.discoveredAt)pop("metricFound",dateFmt(browser.discoveredAt),true);
  if(!badges.children.length)addMetric(badges,t("metricMissing"),true);
  card.append(badges);
  if(noteOf(browser))card.append(node("div","review-note",noteOf(browser)));
  const bottom=node("div","card-bottom"), links=node("div","links");
  if(browser.url&&/^https:\/\//i.test(browser.url))links.append(external(t("website"),browser.url));
  if(browser.releaseNotesUrl&&/^https:\/\//i.test(browser.releaseNotesUrl))links.append(external(t("officialNotes"),browser.releaseNotesUrl));
  if(browser.repo&&/^[\w.-]+\/[\w.-]+$/.test(browser.repo))links.append(external(t("github"),"https://github.com/"+browser.repo));
  const edit=node("button","edit",t("myReview"));
  edit.type="button";edit.addEventListener("click",()=>openEdit(browser));
  bottom.append(links,edit);card.append(bottom);
  return card;
}
function matchesView(row) {
  const status=statusOf(row);
  if(state.view==="new")return status==="new";
  if(state.view==="testing")return status==="testing";
  if(state.view==="checked")return ["checked","rejected"].includes(status);
  return true;
}
function render() {
  if(!state.loaded)return;
  const rows=sortCatalog(
    filterCatalog(state.browsers,state.metrics,{...state,noteOf},statusOf),
    state.metrics,state.sort,statusOf,state.lang
  );
  $("#cards").replaceChildren(...rows.map(buildCard));
  $("#empty").hidden=Boolean(rows.length);
  $("#results-count").textContent=t("count",{shown:rows.length,total:state.browsers.length});
  const count=statuses=>state.browsers.filter(row=>statuses.includes(statusOf(row))).length;
  const stats={
    "total-count":state.browsers.length,
    "stat-new":count(["new"]),"stat-testing":count(["testing"]),
    "stat-checked":count(["checked","rejected"]),
    "stat-active":state.scannedAt?countActiveProjects(state.browsers,state.metrics):"—",
    "nav-all":state.browsers.length,"nav-new":count(["new"]),
    "nav-testing":count(["testing"]),"nav-checked":count(["checked","rejected"])
  };
  for(const [id,value] of Object.entries(stats))$("#"+id).textContent=value;
  const scan=state.scannedAt?t("scan")+": "+dateFmt(state.scannedAt):t("noScan");
  $("#scan-time").textContent=state.scanStatus==="failed"?t("scanFailed")+" · "+scan:state.scanStatus==="partial"?t("scanPartial")+" · "+scan:scan;
  document.querySelectorAll(".nav").forEach(btn=>btn.classList.toggle("active",btn.dataset.view===state.view));
}
function openEdit(row) {
  state.editing=row;
  $("#dialog-name").textContent=row.name;
  $("#review-status").value=statusOf(row);
  $("#review-note").value=noteOf(row);
  $("#review-dialog").showModal();
}
function exportReviews() {
  const blob=new Blob([JSON.stringify(state.reviews,null,2)+"\n"],{type:"application/json"});
  const url=URL.createObjectURL(blob),link=node("a");
  link.href=url;link.download="browser-radar-reviews.json";document.body.append(link);
  link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),0);
}
let pendingImport=null;
function showImportCounts() {
  if(!pendingImport)return;
  const c=compareReviews(state.reviews,pendingImport.imported);
  $("#import-counts").textContent=t("importCounts",c);
  $("#import-conflicts").hidden=!c.conflicts;
}
async function previewImport(file) {
  pendingImport=null;
  $("#import-error").hidden=true;
  $("#import-preview").hidden=true;
  try {
    const imported=parseReviews(await file.text());
    pendingImport={imported,storageSnapshot:stored(REVIEW_KEY)};
    document.querySelector('input[name="import-policy"][value="keep"]').checked=true;
    showImportCounts();
    $("#import-preview").hidden=false;
  }catch(err){
    $("#import-error").textContent=localizedError(err);
    $("#import-error").hidden=false;
  }
  $("#import-dialog").showModal();
}
function applyImport() {
  if(!pendingImport)return;
  try {
    state.reviews=storeImportedReviews(localStorage,REVIEW_KEY,pendingImport.storageSnapshot,state.reviews,pendingImport.imported,document.querySelector('input[name="import-policy"]:checked').value);
  }catch(err){
    $("#import-error").textContent=err?.message?.includes("другой вкладке")?t("changedError"):t("saveError");
    $("#import-error").hidden=false;
    return;
  }
  pendingImport=null;
  $("#import-dialog").close();
  state.imported=true;
  $("#local-hint").textContent=t("imported");
  render();
}
async function getJson(file) {
  const response=await fetch(API_ROOT+file,{cache:"no-store"});
  if(!response.ok)throw new Error(file+": "+response.status);
  return response.json();
}
async function init() {
  applyLanguage();
  $("#language").addEventListener("change",e=>{
    state.lang=e.target.value==="ru"?"ru":"en";
    try{localStorage.setItem(LANGUAGE_KEY,state.lang);}catch{}
    applyLanguage();
    showImportCounts();
    if(!$("#import-error").hidden)$("#import-error").hidden=true;
  });
  $("#review-form").addEventListener("submit",e=>{
    if(e.submitter?.value!=="save"||!state.editing)return;
    e.preventDefault();
    const updated={...state.reviews,[state.editing.id]:{
      ...reviewOf(state.editing),status:$("#review-status").value,
      note:$("#review-note").value.trim(),reviewedAt:new Date().toISOString()
    }};
    try{localStorage.setItem(REVIEW_KEY,JSON.stringify(updated));state.reviews=updated;}
    catch{window.alert(t("saveError"));return;}
    render();
    $("#review-dialog").close();
  });
  $("#export-btn").addEventListener("click",exportReviews);
  $("#import-btn").addEventListener("click",()=>$("#import-file").click());
  $("#import-file").addEventListener("change",e=>{const file=e.target.files[0];e.target.value="";if(file)previewImport(file);});
  $("#import-backup").addEventListener("click",exportReviews);
  $("#import-apply").addEventListener("click",applyImport);
  for(const id of ["import-close","import-cancel"])$("#"+id).addEventListener("click",()=>$("#import-dialog").close());
  $("#search").addEventListener("input",e=>{state.q=e.target.value.trim().toLowerCase();render();});
  $("#engine").addEventListener("change",e=>{state.engine=e.target.value;render();});
  $("#sort").addEventListener("change",e=>{state.sort=e.target.value;render();});
  for(const id of ["platform","source","contributors","license","first-since","stable-since"]){
    $("#"+id).addEventListener("change",e=>{
      const key={"first-since":"firstSince","stable-since":"stableSince"}[id]||id;
      state[key]=e.target.value;render();
    });
  }
  $("#clear-filters").addEventListener("click",()=>{
    for(const id of ["search","platform","source","engine","contributors","license","first-since","stable-since"]){
      const el=$("#"+id);el.value=["platform","source","engine","contributors","license"].includes(id)?"all":"";
    }
    Object.assign(state,{q:"",platform:"all",source:"all",engine:"all",contributors:"all",license:"all",firstSince:"",stableSince:""});
    render();
  });
  document.querySelectorAll("[data-view]").forEach(el=>el.addEventListener("click",()=>{state.view=el.dataset.view;render();}));
  try {
    // Deliberately no reviews.json: no public per-user reviews, ever.
    const [curated,discovery,metrics,official]=await Promise.all(["browsers.json","discovered.json","metrics.json","official.json"].map(getJson));
    const byId=new Map();
    for(const browser of [...curated,...(discovery.candidates||[])])if(browser?.id)byId.set(browser.id,browser);
    state.browsers=[...byId.values()];
    state.metrics={...metrics.repos,...Object.fromEntries(Object.entries(official.sources||{}).map(([id,data])=>[id,officialMetric(data)]))};
    state.scannedAt=discovery.scannedAt||null;
    state.scanStatus=discovery.status||null;
    try{const local=stored(REVIEW_KEY);if(local)state.reviews=parseReviews(local);}catch{state.reviews={};}
    state.loaded=true;
    $("#import-btn").disabled=false;
    render();
  }catch(err){
    $("#cards").replaceChildren(node("div","empty",t("loadError",{error:err.message})));
    $("#results-count").textContent=t("loadErrorTitle");
  }
}
init();
