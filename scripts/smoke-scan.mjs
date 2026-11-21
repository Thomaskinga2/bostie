// Real-API smoke test for landmark recognition (needs the dev server + GEMINI_API_KEY).
//   node scripts/smoke-scan.mjs [baseUrl]
import { readFileSync } from "node:fs";
const base = process.argv[2] ?? "http://localhost:3000";
const wiki = JSON.parse(readFileSync(new URL("../src/data/wiki.json", import.meta.url)));
const parkStreet = { lat: 42.3564, lng: -71.0624, source: "simulated" };
const cases = [
  ["state-house", "state-house", parkStreet],
  ["old-north-church", "old-north-church", undefined],
  ["stn-kendall", null, parkStreet], // a subway platform is not a catalogue landmark
];
let failed = 0;
for (const [photo, expected, location] of cases) {
  const img = await fetch(wiki[photo].src.replace("/960px-", "/500px-"), { headers: { "User-Agent": "BostieSmokeTest/0.1" } });
  if (!img.ok) { console.log(`skip ${photo}: image ${img.status}`); continue; }
  const image = Buffer.from(await img.arrayBuffer()).toString("base64");
  const res = await fetch(`${base}/api/scan`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ image, mimeType: "image/jpeg", location }),
  });
  const d = await res.json();
  if (!res.ok) { failed++; console.log(`FAIL ${photo}: ${res.status} ${JSON.stringify(d)}`); continue; }
  const ok = d.validation.landmarkId === expected;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${photo} → ${d.result.status}/${d.result.verification} id=${d.result.landmarkId} awarded=${d.validation.landmarkId} (${d.validation.verification}) ${d.meta.model} ${d.meta.latencyMs}ms`);
  console.log(`     evidence: ${d.result.visualEvidence.join(" | ")}`);
  console.log(`     checks: ${d.validation.checks.map((c) => `${c.ok ? "✓" : "✗"} ${c.name}`).join("  ")}`);
  if (d.result.uncertaintyReason) console.log(`     uncertainty: ${d.result.uncertaintyReason}`);
  await new Promise((r) => setTimeout(r, 1500));
}
process.exit(failed ? 1 : 0);
