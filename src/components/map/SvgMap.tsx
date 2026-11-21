"use client";
// Built-in schematic map: used when no Google Maps key is configured or Google fails.
// Everything is drawn in screen pixels from a {centre, scale} view, so markers and
// labels keep a constant size while the geography pans and zooms underneath them.
import { Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { BOSTON, type LatLng } from "@/lib/geo";
import { STATION } from "@/lib/network";
import { BOOKMARK_PATH, CARD, FOREST, GOLD, GOLD_SOFT, INK, PIN_PATH, USER_BLUE, type CityMapProps, type MapMarker } from "./shared";

// Equirectangular projection around Boston, in kilometres. Accurate to a few metres at city scale.
const RAD = Math.PI / 180;
const KX = 111.32 * Math.cos(BOSTON.lat * RAD);
const KY = 110.57;
const toWorld = (p: LatLng) => ({ x: (p.lng - BOSTON.lng) * KX, y: (BOSTON.lat - p.lat) * KY });
const toLatLng = (x: number, y: number): LatLng => ({ lat: BOSTON.lat - y / KY, lng: BOSTON.lng + x / KX });
/** Pixels per km at a Google-style zoom level, so `zoom` means the same on both backends. */
const zoomToScale = (z: number) => (1000 * 2 ** z) / (156543.03392 * Math.cos(BOSTON.lat * RAD));
const MIN_S = zoomToScale(10.3); // the whole rapid-transit network fits a phone
const MAX_S = zoomToScale(17.2);
const clampS = (s: number) => Math.min(MAX_S, Math.max(MIN_S, s));

type View = { x: number; y: number; s: number };
type Goal = [LatLng[] | null, LatLng | null, number | null];

function viewFor([fit, center, zoom]: Goal, w: number, h: number): View {
  if (fit?.length) {
    const pts = fit.map(toWorld);
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const s = Math.min(Math.max(w - 96, 40) / Math.max(x1 - x0, 0.05), Math.max(h - 160, 40) / Math.max(y1 - y0, 0.05), zoomToScale(15.5));
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, s: clampS(s) };
  }
  return { ...toWorld(center ?? BOSTON), s: clampS(zoomToScale(zoom ?? 13.4)) };
}

// Hand-traced hints, deliberately rough: this backend is labelled "Schematic map".
// [centreline as lat,lng pairs, width in km]
const WATER: [[number, number][], number][] = [
  [[[42.3712, -71.133], [42.369, -71.1245], [42.364, -71.117], [42.36, -71.115], [42.353, -71.1107]], 0.11],
  [[[42.353, -71.1107], [42.353, -71.1], [42.3545, -71.0915], [42.358, -71.082], [42.3615, -71.0755]], 0.5],
  [[[42.3615, -71.0755], [42.3665, -71.07], [42.369, -71.063], [42.37, -71.056]], 0.2],
  [[[42.37, -71.056], [42.369, -71.048], [42.364, -71.042], [42.356, -71.037], [42.345, -71.02], [42.335, -70.995]], 0.7],
];
const PARKS: [number, number][][] = [
  [[42.3564, -71.0622], [42.3524, -71.0645], [42.3521, -71.0688], [42.356, -71.0701], [42.3578, -71.0634]], // Boston Common
  [[42.3521, -71.0688], [42.352, -71.0716], [42.3556, -71.0726], [42.356, -71.0701]], // Public Garden
];

const ORDER: Record<MapMarker["kind"], number> = { station: 0, landmark: 1, saved: 2, answer: 3, pin: 4, user: 5 };
const isHub = (m: MapMarker) => m.kind === "station" && (STATION[m.id]?.lines.length ?? 1) > 1;
/** Rough marker radius in px, for label offsets. */
const radiusOf = (m: MapMarker, k: number) => (m.kind === "station" ? (isHub(m) ? 6.5 : 4.5) * k : m.kind === "pin" ? 10 : 9 * k);

function Glyph({ m, k }: { m: MapMarker; k: number }) {
  switch (m.kind) {
    case "station": {
      const hub = isHub(m);
      return (
        <circle
          r={(hub ? 6.5 : 4.5) * k}
          fill={m.done ? GOLD : CARD}
          stroke={m.done || hub ? INK : (m.color ?? INK)}
          strokeWidth={m.done ? 1.6 : hub ? 3 : 2.2}
        />
      );
    }
    case "landmark":
      // Landmarks are the collectibles: never let them shrink into specks when zoomed out.
      return (
        <g transform={`scale(${Math.max(0.95, k)})`}>
          <rect x="-6.5" y="-6.5" width="13" height="13" rx="3" transform="rotate(45)" fill={m.done ? GOLD : FOREST} stroke={CARD} strokeWidth="2" />
          {m.done ? (
            <path d="M-3.4,0.2l2.3,2.4l4.4,-4.9" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <circle r="2.3" fill={GOLD} />
          )}
        </g>
      );
    case "saved":
      return <path d={BOOKMARK_PATH} transform={`scale(${k})`} fill={GOLD} stroke={FOREST} strokeWidth="2" strokeLinejoin="round" />;
    case "pin":
      return (
        <>
          <path d={PIN_PATH} fill={m.color ?? INK} stroke={CARD} strokeWidth="2" />
          <circle cy="-21" r="3.6" fill={CARD} />
        </>
      );
    case "answer":
      return (
        <>
          <circle r="12" fill={GOLD_SOFT} stroke={GOLD} strokeWidth="2.5" />
          <circle r="4.5" fill={GOLD} />
        </>
      );
    case "user":
      return (
        <>
          <circle r="13" fill={USER_BLUE} opacity="0.3" className="origin-center animate-ping [transform-box:fill-box]" />
          <circle r="6.5" fill={USER_BLUE} stroke="#fff" strokeWidth="2.5" />
        </>
      );
  }
}

export function SvgMap({ markers, lines = [], selectedId, onSelect, onMapClick, center, zoom, fit, className }: CityMapProps) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View | null>(null);
  // Mirrors of state for gesture handlers, which must read the latest value between renders.
  const live = useRef<View | null>(null);
  const dims = useRef({ w: 0, h: 0 });
  const raf = useRef(0);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const tap = useRef({ x: 0, y: 0, moved: true });

  const apply = useCallback((v: View) => {
    live.current = v;
    setView(v);
  }, []);

  useEffect(() => {
    const ro = new ResizeObserver(([entry]) => {
      const { width: w, height: h } = entry.contentRect;
      dims.current = { w, h };
      setSize({ w, h });
    });
    ro.observe(box.current!);
    return () => ro.disconnect();
  }, []);

  // Fly to wherever the props point: on first layout, and whenever fit/center/zoom change by value.
  const goalKey = JSON.stringify([fit ?? null, center ?? null, zoom ?? null]);
  const goal = useMemo(() => JSON.parse(goalKey) as Goal, [goalKey]);
  const laidOut = size.w > 0 && size.h > 0;
  useEffect(() => {
    if (!laidOut) return;
    const to = viewFor(goal, dims.current.w, dims.current.h);
    const from = live.current;
    const duration = from && !matchMedia("(prefers-reduced-motion: reduce)").matches ? 420 : 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const t = duration ? Math.min(1, (now - t0) / duration) : 1;
      const e = 1 - (1 - t) ** 3;
      apply(from && t < 1 ? { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, s: from.s * (to.s / from.s) ** e } : to);
      if (t < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [goal, laidOut, apply]);

  const zoomAbout = useCallback(
    (px: number, py: number, factor: number) => {
      const v = live.current;
      if (!v) return;
      const { w, h } = dims.current;
      const s = clampS(v.s * factor);
      const wx = v.x + (px - w / 2) / v.s;
      const wy = v.y + (py - h / 2) / v.s;
      apply({ x: wx - (px - w / 2) / s, y: wy - (py - h / 2) / s, s });
    },
    [apply],
  );

  // Wheel zoom needs a non-passive listener to stop the page scrolling behind the map.
  useEffect(() => {
    const el = box.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAbout(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0016));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAbout]);

  const local = (e: ReactPointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    cancelAnimationFrame(raf.current);
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    tap.current = { ...p, moved: pointers.current.size > 1 };
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const prev = pointers.current.get(e.pointerId);
    const v = live.current;
    if (!prev || !v) return;
    const cur = local(e);
    pointers.current.set(e.pointerId, cur);
    if (pointers.current.size === 1) {
      if (Math.hypot(cur.x - tap.current.x, cur.y - tap.current.y) > 6) tap.current.moved = true;
      if (tap.current.moved) apply({ ...v, x: v.x - (cur.x - prev.x) / v.s, y: v.y - (cur.y - prev.y) / v.s });
      return;
    }
    // Pinch: zoom about the midpoint by the change in finger spread.
    tap.current.moved = true;
    const other = [...pointers.current.entries()].find(([id]) => id !== e.pointerId)![1];
    const before = Math.hypot(prev.x - other.x, prev.y - other.y);
    const after = Math.hypot(cur.x - other.x, cur.y - other.y);
    if (before > 0) zoomAbout((cur.x + other.x) / 2, (cur.y + other.y) / 2, after / before);
  };

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    const wasTap = pointers.current.size === 1 && !tap.current.moved;
    pointers.current.delete(e.pointerId);
    const v = live.current;
    if (!wasTap || !v) return;
    const p = local(e);
    const { w, h } = dims.current;
    // Nearest marker within a 24px radius: a comfortable touch target without fat markers.
    let hit: MapMarker | null = null;
    let best = 24;
    if (onSelect)
      for (const m of markers) {
        if (m.kind === "user") continue;
        const wp = toWorld(m);
        const d = Math.hypot(w / 2 + (wp.x - v.x) * v.s - p.x, h / 2 + (wp.y - v.y) * v.s - (m.kind === "pin" ? 12 : 0) - p.y) - (m.kind === "station" ? 0 : 5);
        if (d < best) [hit, best] = [m, d];
      }
    if (hit) onSelect!(hit.id);
    else onMapClick?.(toLatLng(v.x + (p.x - w / 2) / v.s, v.y + (p.y - h / 2) / v.s));
  };

  const { w, h } = size;
  const scene = (() => {
    if (!view || !laidOut) return null;
    const { s } = view;
    const sx = (x: number) => w / 2 + (x - view.x) * s;
    const sy = (y: number) => h / 2 + (y - view.y) * s;
    const path = (pts: LatLng[]) => pts.map((p, i) => `${i ? "L" : "M"}${sx(toWorld(p).x).toFixed(1)},${sy(toWorld(p).y).toFixed(1)}`).join("");
    const pair = ([lat, lng]: [number, number]) => ({ lat, lng });
    const k = Math.min(1.15, Math.max(0.62, s / 120)); // markers shrink a little when zoomed out
    const lineW = Math.min(6, Math.max(2.6, s / 38));

    const visible = markers
      .map((m) => ({ m, x: sx(toWorld(m).x), y: sy(toWorld(m).y) }))
      .filter((v) => v.x > -30 && v.x < w + 30 && v.y > -30 && v.y < h + 40)
      .sort((a, b) => ORDER[a.m.kind] - ORDER[b.m.kind] || +(a.m.id === selectedId) - +(b.m.id === selectedId));

    // Labels appear as you zoom in; overlapping ones are dropped, most important first.
    const wantsLabel = (m: MapMarker) =>
      m.id === selectedId || m.kind === "pin" || m.kind === "answer" ||
      (m.kind === "user" ? s > 50 : m.kind === "station" ? s > (isHub(m) ? 95 : 190) : s > 120);
    const rank = (m: MapMarker) => (m.id === selectedId ? -1 : m.kind === "station" ? (isHub(m) ? 6 : 7) : 5 - ORDER[m.kind]);
    const placed: { x: number; y: number; w: number; text: string; end: boolean; bold: boolean }[] = [];
    const clear = (x: number, y: number, bw: number) => placed.every((b) => x > b.x + b.w + 3 || x + bw + 3 < b.x || Math.abs(y - b.y) > 14);
    for (const { m, x, y } of visible.filter((v) => v.m.label && wantsLabel(v.m)).sort((a, b) => rank(a.m) - rank(b.m))) {
      const bw = m.label.length * 6.4 + 4;
      const gap = radiusOf(m, k) + 5;
      const ly = m.kind === "pin" ? y - 17 : y;
      if (clear(x + gap, ly, bw)) placed.push({ x: x + gap, y: ly, w: bw, text: m.label, end: false, bold: m.id === selectedId });
      else if (clear(x - gap - bw, ly, bw) || m.id === selectedId) placed.push({ x: x - gap - bw, y: ly, w: bw, text: m.label, end: true, bold: m.id === selectedId });
    }

    const sorted = [...lines].sort((a, b) => +!!a.emphasis - +!!b.emphasis);
    return (
      <>
        {WATER.map(([pts, km], i) => (
          <path key={i} d={path(pts.map(pair))} fill="none" stroke="#cddde0" strokeWidth={Math.max(2, km * s)} strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {PARKS.map((pts, i) => (
          <path key={i} d={path(pts.map(pair)) + "Z"} fill="#d6e4c9" />
        ))}
        {sorted.map((l) => (
          <g key={l.id} fill="none" strokeLinecap="round" strokeLinejoin="round">
            {l.emphasis && <path d={path(l.path)} stroke={CARD} strokeWidth={lineW + 6} />}
            <path d={path(l.path)} stroke={l.color} strokeWidth={l.emphasis ? lineW + 2 : lineW} strokeDasharray={l.dashed ? `1 ${lineW + 6}` : undefined} opacity={l.emphasis ? 1 : 0.9} />
          </g>
        ))}
        {visible.map(({ m, x, y }) => (
          <g
            key={m.id}
            transform={`translate(${x.toFixed(1)},${y.toFixed(1)})`}
            {...(onSelect && m.kind !== "user"
              ? {
                  role: "button",
                  tabIndex: 0,
                  "aria-label": m.label + (m.done ? ", collected" : ""),
                  "aria-pressed": m.id === selectedId,
                  onKeyDown: (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect(m.id)),
                  className: "cursor-pointer outline-offset-4 focus-visible:outline-2 focus-visible:outline-forest",
                }
              : { "aria-hidden": true })}
          >
            {m.id === selectedId && <circle cy={m.kind === "pin" ? -21 : 0} r={radiusOf(m, k) + 6} fill="none" stroke={GOLD} strokeWidth="2.5" />}
            <Glyph m={m} k={k} />
          </g>
        ))}
        <g aria-hidden fontSize="11.5" fontFamily="var(--font-sans)" fill={INK} stroke="#f5efe0" strokeWidth="3.2" strokeLinejoin="round" paintOrder="stroke" className="pointer-events-none">
          {placed.map((b) => (
            <text key={b.text + b.x} x={b.end ? b.x + b.w : b.x} y={b.y + 4} textAnchor={b.end ? "end" : "start"} fontWeight={b.bold ? 700 : 600}>
              {b.text}
            </text>
          ))}
        </g>
      </>
    );
  })();

  const zoomBtn = "grid size-10 place-items-center text-ink active:bg-sand";
  return (
    <div ref={box} className={`relative overflow-hidden bg-paper ${className ?? ""}`}>
      <svg
        width={w}
        height={h}
        role="group"
        aria-label="Map of Boston and the MBTA network"
        className="block cursor-grab touch-none select-none active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={(e) => pointers.current.delete(e.pointerId)}
      >
        {scene}
      </svg>
      <div className="absolute bottom-3 right-3 flex flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-card">
        <button type="button" aria-label="Zoom in" className={zoomBtn} onClick={() => zoomAbout(dims.current.w / 2, dims.current.h / 2, 1.6)}>
          <Plus size={18} aria-hidden />
        </button>
        <span className="h-px bg-line" />
        <button type="button" aria-label="Zoom out" className={zoomBtn} onClick={() => zoomAbout(dims.current.w / 2, dims.current.h / 2, 1 / 1.6)}>
          <Minus size={18} aria-hidden />
        </button>
      </div>
      <span className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-card/85 px-2 py-1 text-[10.5px] leading-none text-ink-faint">Schematic map</span>
    </div>
  );
}
