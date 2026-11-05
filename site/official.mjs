// Official release observations are different from repository activity metrics.
export function officialMetric(record){
  const releases=record?.releases||{};
  const published=Object.values(releases).filter(x=>x?.publishedAt && /^\d{4}-\d{2}-\d{2}$/.test(x.publishedAt));
  const last=published.sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt))[0]||null;
  return {
    official:true,
    releasesByPlatform:releases,
    latestOfficialAt:last?.publishedAt||null,
    latestOfficialVersion:last?.version||null,
    officialSourceUrl:record?.sourceUrl||null,
    sourceCheckedAt:record?.checkedAt||null
  };
}
