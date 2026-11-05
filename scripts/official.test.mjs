import test from "node:test";
import assert from "node:assert/strict";
import {officialMetric} from "../site/official.mjs";
test("official releases are normalized without inventing GitHub metadata",()=>{
  const m=officialMetric({sourceUrl:"https://example.org/changelog",releases:{
    macOS:{version:"1.55.0",publishedAt:"2026-10-29"},Windows:{version:"1.4.0",publishedAt:"2026-10-27"}
  }});
  assert.equal(m.latestOfficialAt,"2026-10-29");
  assert.equal(m.releasesByPlatform.Windows.version,"1.4.0");
  assert.equal(m.stars,undefined);
  assert.equal(m.activeAuthors90d,undefined);
  assert.equal(m.firstReleaseAt,undefined);
  assert.equal(m.latestStableAt,undefined);
});
test("missing official version remains unknown",()=>{
  const m=officialMetric({releases:{}});
  assert.equal(m.latestOfficialAt,null);
  assert.equal(m.latestOfficialVersion,null);
});
