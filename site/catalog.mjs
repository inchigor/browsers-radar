// Public browser metadata helpers. Unknown values never pass specific filters.
export const PLATFORM_OPTIONS = ["all", "macOS", "Windows", "Linux"];
export const PRIORITY = ["primary", "secondary", "testing", "unreviewed", "new", "watch", "checked", "rejected"];

const number = value => Number.isFinite(value) ? value : null;
const date = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;

export function matchesPlatform(platform, selected) {
  if (!selected || selected === "all") return true;
  if (typeof platform !== "string") return false;
  return platform.split(/[,;/]/).some(token => token.trim().toLowerCase() === selected.toLowerCase());
}
export function matchesContributors(metric, range) {
  if (!range || range === "all") return true;
  const count = number(metric?.activeAuthors90d);
  if (count === null) return false;
  if (range === "0") return count === 0;
  if (range === "1") return count === 1;
  if (range === "2-5") return count >= 2 && count <= 5;
  if (range === "6-10") return count >= 6 && count <= 10;
  if (range === "11+") return count >= 11;
  return true;
}
export function matchesDate(value, after) {
  if (!after) return true;
  const at = date(value);
  return at !== null && at >= after;
}
export function licenseName(metric) {
  const value = metric?.licenseSpdx;
  return typeof value === "string" && value !== "NOASSERTION" && value.trim() ? value : null;
}
export function matchesLicense(metric, selected) {
  if (!selected || selected === "all") return true;
  const license = licenseName(metric);
  if (selected === "known") return license !== null;
  if (selected === "unknown") return license === null;
  if (!license) return false;
  if (selected === "GPL") return /^(?:A?GPL|LGPL)-/.test(license);
  if (selected === "MPL") return /^MPL-/.test(license);
  if (selected === "Apache") return /^Apache-/.test(license);
  if (selected === "MIT") return license === "MIT";
  if (selected === "other") return !["MIT", "GPL", "MPL", "Apache"].some(group => matchesLicense(metric, group));
  return true;
}
export function filterCatalog(rows, metrics, filters, statusOf) {
  return rows.filter(row => {
    const status = statusOf(row);
    if (filters.view === "new" && status !== "new") return false;
    if (filters.view === "testing" && status !== "testing") return false;
    if (filters.view === "checked" && !["checked", "rejected"].includes(status)) return false;
    const metric = metrics[row.repo] || {};
    if (!matchesPlatform(row.platform, filters.platform)) return false;
    if (filters.engine && filters.engine !== "all" && !String(row.engine).toLowerCase().includes(filters.engine.toLowerCase())) return false;
    if (!matchesContributors(metric, filters.contributors)) return false;
    if (!matchesDate(metric.firstReleaseAt, filters.firstSince)) return false;
    if (!matchesDate(metric.latestStableAt, filters.stableSince)) return false;
    if (!matchesLicense(metric, filters.license)) return false;
    const hay = [row.name, row.engine, row.platform, row.repo, row.summary, row.summaryRu, filters.noteOf?.(row)].join(" ").toLowerCase();
    return hay.includes(filters.q || "");
  });
}
function compareOptional(a, b, direction = "desc") {
  // Unknown values always last, regardless of sort direction.
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return direction === "asc" ? (a < b ? -1 : a > b ? 1 : 0) : (a > b ? -1 : a < b ? 1 : 0);
}
export function sortCatalog(rows, metrics, sort, statusOf, lang = "en") {
  const key = metric => {
    if (sort === "stars") return number(metric?.stars);
    if (sort === "contributors") return number(metric?.activeAuthors90d);
    if (sort === "updated") return date(metric?.lastPush);
    if (sort === "latest-stable") return date(metric?.latestStableAt);
    if (sort === "first-release-new" || sort === "first-release-old") return date(metric?.firstReleaseAt);
    return null;
  };
  const direction = sort === "first-release-old" ? "asc" : "desc";
  return [...rows].sort((a, b) => {
    if (sort === "priority") {
      const rank = PRIORITY.indexOf(statusOf(a)) - PRIORITY.indexOf(statusOf(b));
      if (rank) return rank;
    } else if (sort !== "name") {
      const order = compareOptional(key(metrics[a.repo] || {}), key(metrics[b.repo] || {}), direction);
      if (order) return order;
    }
    return a.name.localeCompare(b.name, lang);
  });
}
