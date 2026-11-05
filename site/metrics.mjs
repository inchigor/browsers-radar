const DAY = 86400000;
const timeValue = value => value ? Date.parse(value) || 0 : 0;

export function countActiveProjects(browsers, metrics, now=Date.now()) {
  const repos = new Set(browsers.map(browser=>browser.repo).filter(Boolean));
  return [...repos].filter(repo=>{
    const lastPush=timeValue(metrics[repo]?.lastPush);
    return lastPush && lastPush<=now && now-lastPush<90*DAY;
  }).length;
}

export function metricFreshness(metric, now=Date.now()) {
  const updated=timeValue(metric?.updatedAt);
  if(!updated || updated>now)return "unknown";
  return now-updated>=14*DAY?"stale":"fresh";
}
