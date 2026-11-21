"use client";
// Share pictures, drawn on a canvas in the browser. Nothing is uploaded: the picture is
// handed to the phone's share sheet (Instagram, Facebook, Messages…) or saved as a file.
// A website cannot post into those apps directly; the rider picks the app.
import type { LatLng } from "./geo";
import { LINES, lineOf, PATTERNS, STATION } from "./network";
import type { DayRecap, HeatPoint } from "./recap";

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

/** The rider's day as a dark, Strava-style map: the T in faint colour, heat where they went, and their GPS path. */
export async function dayCard(o: { recap: DayRecap; heat: HeatPoint[]; segments: LatLng[][]; rider: string; at: number }): Promise<Blob> {
  const { c, g } = await canvas();
  g.fillStyle = "#0e1813";
  g.fillRect(0, 0, W, H);
  await brand(g, 96, CREAM);

  // Frame everything the rider touched, with a floor so one stop does not zoom to a dot.
  const pts = [...o.heat, ...o.segments.flat()];
  const focus = pts.length ? pts : [{ lat: 42.3564, lng: -71.0624 }];
  const lat0 = focus.reduce((n, p) => n + p.lat, 0) / focus.length;
  const kx = Math.cos((lat0 * Math.PI) / 180);
  let [minX, maxX, minY, maxY] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const p of focus) {
    minX = Math.min(minX, p.lng * kx); maxX = Math.max(maxX, p.lng * kx);
    minY = Math.min(minY, -p.lat); maxY = Math.max(maxY, -p.lat);
  }
  const box = { x: 60, y: 300, w: W - 120, h: 980 };
  const span = Math.max(maxX - minX, (maxY - minY) * (box.w / box.h), 0.03);
  const scale = (box.w * 0.82) / span;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const X = (p: LatLng) => box.x + box.w / 2 + (p.lng * kx - cx) * scale;
  const Y = (p: LatLng) => box.y + box.h / 2 + (-p.lat - cy) * scale;

  g.save();
  g.beginPath();
  g.roundRect(box.x, box.y, box.w, box.h, 56);
  g.clip();
  g.fillStyle = "#14231c";
  g.fillRect(box.x, box.y, box.w, box.h);
  g.lineCap = "round";
  g.lineJoin = "round";
  // The network, faintly, for context.
  for (const p of PATTERNS) {
    g.strokeStyle = LINES[lineOf(p.route)].color;
    g.globalAlpha = 0.34;
    g.lineWidth = 7;
    g.beginPath();
    p.stops.forEach((id, i) => (i ? g.lineTo(X(STATION[id]), Y(STATION[id])) : g.moveTo(X(STATION[id]), Y(STATION[id]))));
    g.stroke();
  }
  g.globalAlpha = 1;
  // Heat: glows add up where the rider went most.
  g.globalCompositeOperation = "lighter";
  for (const p of o.heat) {
    const r = 46 + Math.min(70, p.weight * 16);
    const glow = g.createRadialGradient(X(p), Y(p), 0, X(p), Y(p), r);
    glow.addColorStop(0, `rgba(255,170,40,${Math.min(0.85, 0.3 + p.weight * 0.12)})`);
    glow.addColorStop(0.5, "rgba(240,90,30,0.22)");
    glow.addColorStop(1, "rgba(240,90,30,0)");
    g.fillStyle = glow;
    g.fillRect(X(p) - r, Y(p) - r, r * 2, r * 2);
  }
  g.globalCompositeOperation = "source-over";
  // The exact path walked and ridden above ground.
  g.strokeStyle = "#ffe08a";
  g.lineWidth = 6;
  for (const seg of o.segments) {
    g.beginPath();
    seg.forEach((p, i) => (i ? g.lineTo(X(p), Y(p)) : g.moveTo(X(p), Y(p))));
    g.stroke();
  }
  for (const s of o.recap.stations) {
    const p = STATION[s.id];
    g.fillStyle = CREAM;
    g.beginPath();
    g.arc(X(p), Y(p), 9, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();

  g.textAlign = "left";
  g.fillStyle = GOLD;
  g.font = `700 42px ${sans()}`;
  g.fillText(longDate(o.at), 72, 1372);
  g.fillStyle = CREAM;
  g.font = `700 96px ${serif()}`;
  g.fillText("My day on the T", 72, 1478);

  const km = o.recap.rideKm + o.recap.trailKm;
  const stats: [string, string][] = [
    [String(o.recap.stations.length), "stations"],
    [String(o.recap.landmarks.length), "landmarks"],
    [km >= 10 ? km.toFixed(0) : km.toFixed(1), "km"],
    [String(o.recap.xp), "XP"],
  ];
  stats.forEach(([n, label], i) => {
    const x = 72 + i * 240;
    g.fillStyle = CREAM;
    g.font = `700 84px ${serif()}`;
    g.fillText(n, x, 1622);
    g.fillStyle = "rgba(245,239,224,0.66)";
    g.font = `400 36px ${sans()}`;
    g.fillText(label, x, 1672);
  });
  const names = [...o.recap.landmarks, ...o.recap.stations].map((p) => p.name);
  if (names.length) {
    g.fillStyle = "rgba(245,239,224,0.82)";
    g.font = `400 38px ${sans()}`;
    wrap(g, names.slice(0, 7).join(", ") + (names.length > 7 ? ` and ${names.length - 7} more` : ""), 72, 1756, W - 144, 50, 2);
  }
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
