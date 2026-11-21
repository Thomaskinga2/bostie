// Resolves one freely licensed Wikimedia Commons photo (with author + licence for
// attribution) per place, and cross-checks our coordinates against Wikipedia's.
// Writes src/data/wiki.json. Images are hot-linked, never copied.
// Two batched API requests in total, to stay well inside Wikimedia's rate limits.
//   node scripts/fetch-wiki.mjs
import { writeFileSync } from "node:fs";
import { PLACES } from "../src/data/places.ts";

const UA = { "User-Agent": "TQuestBuildScript/0.1 (hackathon project; node fetch)" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const api = async (host, params) => {
  const url = `https://${host}/w/api.php?${new URLSearchParams({ action: "query", format: "json", formatversion: "2", ...params })}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: UA });
    if (res.status === 429 && attempt < 5) { console.log("rate limited, waiting"); await sleep(30000 * (attempt + 1)); continue; }
    if (!res.ok) throw new Error(`${res.status} ${host}`);
    return res.json();
  }
};
const strip = (html = "") => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const km = (a, b) => {
  const r = Math.PI / 180;
  return Math.hypot((b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r), (b.lat - a.lat) * r) * 6371;
};

// 1. Lead image + coordinates for every article.
const pages = await api("en.wikipedia.org", {
  prop: "pageimages|coordinates|info", piprop: "name", inprop: "url", redirects: "1", colimit: "max", pilimit: "max",
  titles: PLACES.map((p) => p.wiki).join("|"),
});
const rename = Object.fromEntries([...(pages.query.normalized ?? []), ...(pages.query.redirects ?? [])].map((r) => [r.from, r.to]));
const resolve = (t) => { while (rename[t]) t = rename[t]; return t; };
const byTitle = Object.fromEntries(pages.query.pages.map((p) => [p.title, p]));

// 2. Thumbnail URL + licence metadata for every lead image.
const files = [...new Set(Object.values(byTitle).map((p) => p.pageimage).filter(Boolean))];
await sleep(2000);
const infos = await api("commons.wikimedia.org", {
  prop: "imageinfo", iiprop: "url|extmetadata|size", iiurlwidth: "960", titles: files.map((f) => "File:" + f).join("|"),
});
const fileRename = Object.fromEntries((infos.query.normalized ?? []).map((r) => [r.from, r.to]));
const byFile = Object.fromEntries(infos.query.pages.map((p) => [p.title, p]));

const out = {};
for (const p of PLACES) {
  const page = byTitle[resolve(p.wiki)];
  if (!page || page.missing) { console.warn(`FAIL ${p.id}: no article "${p.wiki}"`); continue; }
  const c = page.coordinates?.[0];
  if (c) {
    const d = km(p, { lat: c.lat, lng: c.lon });
    if (d > 0.25) console.warn(`  ! ${p.id}: ours is ${d.toFixed(2)} km from Wikipedia (${c.lat.toFixed(4)}, ${c.lon.toFixed(4)})`);
  }
  const title = page.pageimage && "File:" + page.pageimage;
  const ii = title && byFile[fileRename[title] ?? title]?.imageinfo?.[0];
  if (!ii) { console.warn(`FAIL ${p.id}: lead image is not on Commons (${page.pageimage ?? "none"})`); continue; }
  const meta = ii.extmetadata ?? {};
  out[p.id] = {
    src: ii.thumburl,
    width: ii.thumbwidth,
    height: ii.thumbheight,
    credit: strip(meta.Artist?.value).slice(0, 80) || "Wikimedia Commons contributor",
    license: strip(meta.LicenseShortName?.value) || "see source",
    source: ii.descriptionurl,
    article: page.fullurl,
  };
  console.log(`ok   ${p.id}  ${out[p.id].license}  ${out[p.id].width}x${out[p.id].height}  ${page.pageimage}`);
}
writeFileSync(new URL("../src/data/wiki.json", import.meta.url), JSON.stringify(out, null, 1));
console.log(`${Object.keys(out).length}/${PLACES.length} places have a photo`);
