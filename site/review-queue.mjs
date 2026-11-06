import {isExcludedBrowser} from './excluded.mjs';

export function partitionCatalog(curated, candidates, approved) {
  const key=row=>String(row.repo||row.id||'').toLowerCase();
  const approvedIds=new Set(approved.map(id=>String(id).toLowerCase()));
  const catalog=[], pending=[], seen=new Set();
  for(const row of curated){
    const id=key(row);
    if(!row.id || !id || isExcludedBrowser(id) || seen.has(id))continue;
    seen.add(id);catalog.push(row);
  }
  for(const row of candidates){
    const id=key(row);
    if(!row.id || !id || isExcludedBrowser(id) || seen.has(id))continue;
    seen.add(id);
    (approvedIds.has(id)?catalog:pending).push(row);
  }
  return {catalog,pending};
}

// Evidence is displayed as verified only with an explicit date and HTTPS source.
export function verifiedFeature(browser, feature){
  const entry=browser.verification?.[feature];
  if(!entry || !['yes','no'].includes(entry.value) || !/^\d{4}-\d{2}-\d{2}$/.test(entry.checkedAt||''))return null;
  const date=new Date(entry.checkedAt);
  if(!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10)!==entry.checkedAt)return null;
  try { if(new URL(entry.source).protocol!=='https:')return null; } catch { return null; }
  return entry;
}
