"use client";
// Share pictures, drawn on a canvas in the browser. Nothing is uploaded: the picture is
// handed to the phone's share sheet (Instagram, Facebook, Messages…) or saved as a file.
// A website cannot post into those apps directly; the rider picks the app.
import type { LatLng } from "./geo";
import { LINES, lineOf, PATTERNS, STATION } from "./network";
import { PLACE } from "./places";
import type { DayRecap } from "./recap";

const W = 1080;
const H = 1920; // story format, 9:16
const CREAM = "#f5efe0";
const GOLD = "#e2a11b";
const FOREST = "#1f4b3a";

const load = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image failed to load"));
    img.src = src;
  });

const family = (v: string, fallback: string) => `${getComputedStyle(document.documentElement).getPropertyValue(v).trim() || fallback}, ${fallback}`;
const serif = () => family("--font-caslon", "Georgia, serif");
const sans = () => family("--font-hanken", "Helvetica, Arial, sans-serif");

async function canvas() {
  await document.fonts?.ready;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  return { c, g: c.getContext("2d")! };
}
const toBlob = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("could not make the picture"))), "image/png"));

/** Draws text wrapped to `maxWidth`, returns the y below the last line. */
function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines = 4) {
  const words = text.split(" ");
  let line = "";
  let lines = 0;
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (g.measureText(next).width > maxWidth && line) {
      g.fillText(line, x, y);
      y += lineHeight;
      line = w;
      if (++lines >= maxLines - 1) break;
    } else line = next;
  }
  g.fillText(line, x, y);
  return y + lineHeight;
}

async function brand(g: CanvasRenderingContext2D, y: number, color: string) {
  try {
    const face = await load("/mascot-face.png");
    g.save();
    g.beginPath();
    g.roundRect(72, y, 104, 104, 30);
    g.clip();
    g.fillStyle = CREAM;
    g.fillRect(72, y, 104, 104);
    g.drawImage(face, 72, y, 104, 104);
    g.restore();
  } catch {
    /* the picture still works without the mascot */
  }
  g.fillStyle = color;
  g.font = `700 60px ${serif()}`;
  g.textBaseline = "middle";
  g.fillText("Bostie", 200, y + 54);
  g.textBaseline = "alphabetic";
}

const longDate = (at: number) => new Date(at).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

/** The rider's own landmark photo with the discovery written over it. The photo is not kept afterwards. */
export async function landmarkCard(o: { photo: string; place: { name: string; neighborhood: string; year?: string }; rider: string; at: number }): Promise<Blob> {
  const { c, g } = await canvas();
  g.fillStyle = "#101a15";
  g.fillRect(0, 0, W, H);
  try {
    const img = await load(o.photo);
    const scale = Math.max(W / img.width, H / img.height); // cover
    g.drawImage(img, (W - img.width * scale) / 2, (H - img.height * scale) / 2, img.width * scale, img.height * scale);
  } catch {
    /* fall back to the plain dark card */
  }
  const top = g.createLinearGradient(0, 0, 0, 420);
  top.addColorStop(0, "rgba(10,18,14,0.78)");
  top.addColorStop(1, "rgba(10,18,14,0)");
  g.fillStyle = top;
  g.fillRect(0, 0, W, 420);
  const bottom = g.createLinearGradient(0, H - 1050, 0, H);
  bottom.addColorStop(0, "rgba(10,18,14,0)");
  bottom.addColorStop(0.45, "rgba(10,18,14,0.8)");
  bottom.addColorStop(1, "rgba(10,18,14,0.96)");
  g.fillStyle = bottom;
  g.fillRect(0, H - 1050, W, 1050);

  await brand(g, 96, CREAM);

  // "Stamp collected" seal
  g.save();
  g.translate(W - 190, 190);
  g.rotate(-0.16);
  g.fillStyle = GOLD;
  g.beginPath();
  g.arc(0, 0, 118, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = CREAM;
  g.lineWidth = 4;
  g.setLineDash([6, 10]);
  g.beginPath();
  g.arc(0, 0, 100, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "#143427";
  g.textAlign = "center";
  g.font = `700 40px ${sans()}`;
  g.fillText("Stamp", 0, -4);
  g.fillText("collected", 0, 42);
  g.restore();

  g.textAlign = "left";
  g.fillStyle = GOLD;
  g.font = `700 44px ${sans()}`;
  g.fillText("Landmark discovered", 72, H - 610);
  g.fillStyle = CREAM;
  g.font = `700 112px ${serif()}`;
  let y = wrap(g, o.place.name, 72, H - 480, W - 144, 122, 3);
  g.font = `400 46px ${sans()}`;
  g.fillStyle = "rgba(245,239,224,0.86)";
  g.fillText(`${o.place.neighborhood}${o.place.year ? `, since ${o.place.year}` : ""}`, 72, y - 30);
  y += 40;
  g.font = `400 40px ${sans()}`;
  g.fillStyle = "rgba(245,239,224,0.7)";
  g.fillText(`Verified with Gemini. ${longDate(o.at)}`, 72, y);
  g.fillText(`${o.rider} is exploring Boston on the T`, 72, y + 58);
  return toBlob(c);
}

const INK = "#1f2a24";
const TILE_PX = 512; // tiles are drawn at twice their size so street names stay readable in a 1080px picture
const mercX = (lng: number) => (lng + 180) / 360;
const mercY = (lat: number) => (1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2;

/** A street-map tile, readable back from the canvas. Resolves null if it does not arrive in time. */
const tile = (z: number, x: number, y: number) =>
  new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    setTimeout(() => resolve(null), 6000);
    img.src = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
  });

/** A round passport stamp with the place name inside. */
function stamp(g: CanvasRenderingContext2D, x: number, y: number, r: number, name: string, color: string, fill: string | null, tilt: number) {
  g.save();
  g.translate(x, y);
  g.rotate(tilt);
  if (fill) {
    g.fillStyle = fill;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = color;
  g.lineWidth = 6;
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 3;
  g.setLineDash([5, 9]);
  g.beginPath();
  g.arc(0, 0, r - 13, 0, Math.PI * 2);
  g.stroke();
  // The name on up to three lines, shrunk until the widest fits inside the ring.
  const words = name.replace("/", "/ ").split(" ");
  const lines: string[] = [];
  for (const w of words) {
    const last = lines[lines.length - 1];
    if (last && (last + " " + w).length <= 10) lines[lines.length - 1] = `${last} ${w}`;
    else lines.push(w);
  }
  const shown = lines.slice(0, 3);
  let size = 30;
  const max = (r - 22) * 1.7;
  do g.font = `700 ${size}px ${sans()}`;
  while (shown.some((l) => g.measureText(l).width > max) && --size > 18);
  g.fillStyle = color;
  g.textAlign = "center";
  g.textBaseline = "middle";
  shown.forEach((l, i) => g.fillText(l, 0, (i - (shown.length - 1) / 2) * size * 1.08));
  g.restore();
}

/**
 * The rider's day, map first: a street map with a numbered pin for every place they
 * collected, in order, their GPS path, and the stamps they earned underneath.
 */
export async function dayCard(o: { recap: DayRecap; segments: LatLng[][]; rider: string; at: number }): Promise<Blob> {
  const { c, g } = await canvas();
  g.fillStyle = "#f4f1ea";
  g.fillRect(0, 0, W, H);
  await brand(g, 70, INK);

  // Everything collected today, in the order it happened.
  const places = [
    ...o.recap.stations.map((s) => ({ ...s, lat: STATION[s.id].lat, lng: STATION[s.id].lng, color: LINES[STATION[s.id].lines[0]].color, landmark: false })),
    ...o.recap.landmarks.flatMap((l) => (PLACE[l.id] ? [{ ...l, lat: PLACE[l.id].lat, lng: PLACE[l.id].lng, color: "#a87908", landmark: true }] : [])),
  ].sort((a, b) => a.at - b.at);

  const box = { x: 48, y: 214, w: W - 96, h: 1020 };
  const pts: LatLng[] = [...places, ...o.segments.flat()];
  const focus = pts.length ? pts : [{ lat: 42.3564, lng: -71.0624 }];
  const xs = focus.map((p) => mercX(p.lng));
  const ys = focus.map((p) => mercY(p.lat));
  const [cx, cy] = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  // The closest zoom that still shows every place with room around it.
  let z = 16;
  while (z > 10 && ((Math.max(...xs) - Math.min(...xs)) * TILE_PX * 2 ** z > box.w * 0.74 || (Math.max(...ys) - Math.min(...ys)) * TILE_PX * 2 ** z > box.h * 0.7)) z--;
  const world = TILE_PX * 2 ** z;
  const X = (p: LatLng) => box.x + box.w / 2 + (mercX(p.lng) - cx) * world;
  const Y = (p: LatLng) => box.y + box.h / 2 + (mercY(p.lat) - cy) * world;

  g.save();
  g.beginPath();
  g.roundRect(box.x, box.y, box.w, box.h, 48);
  g.clip();
  g.fillStyle = "#e8eaed";
  g.fillRect(box.x, box.y, box.w, box.h);
  const [left, top] = [cx * world - box.w / 2, cy * world - box.h / 2];
  const jobs: Promise<boolean>[] = [];
  for (let tx = Math.floor(left / TILE_PX); tx * TILE_PX < left + box.w; tx++)
    for (let ty = Math.floor(top / TILE_PX); ty * TILE_PX < top + box.h; ty++)
      jobs.push(tile(z, tx, ty).then((img) => (img ? (g.drawImage(img, box.x + tx * TILE_PX - left, box.y + ty * TILE_PX - top, TILE_PX, TILE_PX), true) : false)));
  const streets = (await Promise.all(jobs)).every(Boolean);
  g.lineCap = "round";
  g.lineJoin = "round";
  if (!streets) {
    // No street map (offline, or tiles blocked): the T itself gives the picture its shape.
    for (const p of PATTERNS) {
      g.strokeStyle = LINES[lineOf(p.route)].color;
      g.globalAlpha = 0.45;
      g.lineWidth = 8;
      g.beginPath();
      p.stops.forEach((id, i) => (i ? g.lineTo(X(STATION[id]), Y(STATION[id])) : g.moveTo(X(STATION[id]), Y(STATION[id]))));
      g.stroke();
    }
    g.globalAlpha = 1;
  }
  const path = (line: LatLng[], color: string, width: number, dash: number[] = []) => {
    if (line.length < 2) return;
    g.setLineDash(dash);
    g.strokeStyle = color;
    g.lineWidth = width;
    g.beginPath();
    line.forEach((p, i) => (i ? g.lineTo(X(p), Y(p)) : g.moveTo(X(p), Y(p))));
    g.stroke();
    g.setLineDash([]);
  };
  // The order of the day, then the exact path walked above ground.
  path(places, "#ffffff", 16);
  path(places, FOREST, 8);
  for (const seg of o.segments) path(seg, "#c2410c", 7, [2, 14]);

  // Names first, skipping any that would cover a pin or another name (the stamps below name them all).
  const pins = places.slice(0, 12).map((p) => ({ ...p, x: X(p), y: Y(p) }));
  const taken = pins.map((p) => ({ x0: p.x - 34, x1: p.x + 34, y0: p.y - 34, y1: p.y + 34 }));
  g.font = `700 30px ${sans()}`;
  g.textBaseline = "middle";
  for (const p of pins) {
    const w = g.measureText(p.name).width;
    const right = p.x + 44 + w < box.x + box.w - 16;
    const r = { x0: right ? p.x + 38 : p.x - 44 - w, x1: right ? p.x + 48 + w : p.x - 38, y0: p.y - 20, y1: p.y + 20 };
    if (r.x0 < box.x + 8 || taken.some((t) => r.x0 < t.x1 && r.x1 > t.x0 && r.y0 < t.y1 && r.y1 > t.y0)) continue;
    taken.push(r);
    g.textAlign = right ? "left" : "right";
    g.lineWidth = 8;
    g.strokeStyle = "#ffffff";
    g.strokeText(p.name, p.x + (right ? 44 : -44), p.y + 1);
    g.fillStyle = INK;
    g.fillText(p.name, p.x + (right ? 44 : -44), p.y + 1);
  }
  // Numbered pins on top, in the order of the day.
  g.textAlign = "center";
  pins.forEach((p, i) => {
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.arc(p.x, p.y, 31, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = p.color;
    g.beginPath();
    g.arc(p.x, p.y, 26, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#ffffff";
    g.fillText(String(i + 1), p.x, p.y + 1);
  });
  g.textBaseline = "alphabetic";
  if (streets) {
    g.textAlign = "right";
    g.font = `400 22px ${sans()}`;
    g.lineWidth = 6;
    g.strokeStyle = "rgba(255,255,255,0.85)";
    g.strokeText("© OpenStreetMap contributors", box.x + box.w - 22, box.y + box.h - 18);
    g.fillStyle = "#4d564f";
    g.fillText("© OpenStreetMap contributors", box.x + box.w - 22, box.y + box.h - 18);
  }
  g.restore();

  g.textAlign = "left";
  g.fillStyle = "#8a6a12";
  g.font = `700 40px ${sans()}`;
  g.fillText(longDate(o.at), 64, 1312);
  g.fillStyle = INK;
  g.font = `700 92px ${serif()}`;
  g.fillText("My day on the T", 64, 1410);

  // The day's stamps: six fit. With more, landmarks keep their place and the rest become a count.
  const r = 76;
  const keep = places.length > 6 ? new Set([...places.filter((p) => p.landmark), ...places.filter((p) => !p.landmark)].slice(0, 5)) : null;
  const shown = keep ? places.filter((p) => keep.has(p)) : places;
  shown.forEach((p, i) => stamp(g, 64 + r + i * 160, 1558, r, p.name, p.landmark ? "#6a4b0c" : p.color, p.landmark ? "#f6e3a8" : null, ((i % 2 ? 1 : -1) * (4 + (i % 3))) / 60));
  if (places.length > shown.length) stamp(g, 64 + r + shown.length * 160, 1558, r, `+${places.length - shown.length} more`, "#4d564f", null, 0.05);
  if (!places.length) {
    g.fillStyle = "#4d564f";
    g.font = `400 40px ${sans()}`;
    g.fillText("No stamps yet today: just the route.", 64, 1570);
  }

  const km = o.recap.rideKm + o.recap.trailKm;
  const n = (count: number, one: string) => `${count} ${one}${count === 1 ? "" : "s"}`;
  g.fillStyle = INK;
  g.font = `700 44px ${sans()}`;
  g.textAlign = "left";
  g.fillText([n(o.recap.stations.length, "station"), n(o.recap.landmarks.length, "landmark"), `${km >= 10 ? km.toFixed(0) : km.toFixed(1)} km`, `${o.recap.xp} XP`].join("   "), 64, 1752);
  g.fillStyle = "#4d564f";
  g.font = `400 36px ${sans()}`;
  g.fillText(`${o.rider} is exploring Boston with Bostie`, 64, 1812);
  g.fillStyle = FOREST;
  g.fillRect(0, H - 14, W, 14);
  return toBlob(c);
}

export const canShareFiles = () => {
  try {
    return !!navigator.canShare?.({ files: [new File([""], "a.png", { type: "image/png" })] });
  } catch {
    return false;
  }
};

/** Opens the system share sheet with the picture. Returns what happened so the UI can say so. */
export async function shareImage(blob: Blob, caption: string, filename: string): Promise<"shared" | "cancelled" | "unsupported"> {
  const file = new File([blob], filename, { type: "image/png" });
  if (!canShareFiles()) return "unsupported";
  try {
    await navigator.share({ files: [file], text: caption, title: "Bostie" });
    return "shared";
  } catch (e) {
    return (e as Error).name === "AbortError" ? "cancelled" : "unsupported";
  }
}

export function saveImage(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
