// Manually reviewed non-browser entries remain in discovery history and local reviews.
const excluded = new Set([
  "mikklfr/browser2zen", "manuelpuyol/firefox-zen", "rajsoni76515/brave-private-browsing-setup",
  "dorianganessa/fourdock-macos", "webkit/webkit", "pmirvine/risc-os",
  "dracievajko/auto-deal-researcher", "aeonfun/opendia", "vibe-karlo/roko-browser",
  "sakibshahariar/mediagrab"
]);
export const isExcludedBrowser = id => excluded.has(String(id || "").toLowerCase());
