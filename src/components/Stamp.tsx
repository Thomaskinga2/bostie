"use client";
// Deterministic stamp templates. Every stamp's look is a pure function of its id:
// stations are transit roundels in their line colours, landmarks are perforated
// postage stamps printed from the landmark's photo, collections are gold seals.
import { PLACE, photoOf } from "@/lib/places";
import type { Rarity, Stamp } from "@/lib/gamification";
import { LINES, STATION } from "@/lib/network";
import { cx } from "./ui";

// Ink colours for stamp artwork. The tiers behind them are internal: no rarity label is shown anywhere.
export const RARITY_INK: Record<Rarity, string> = {
  common: "var(--color-r-common)",
  uncommon: "var(--color-r-uncommon)",
  rare: "var(--color-r-rare)",
  epic: "var(--color-r-epic)",
  legendary: "var(--color-r-legendary)",
};

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
/** A hand-stamped tilt between -5° and 5°, fixed per stamp. */
export const tiltOf = (id: string) => (Math.abs(hash(id)) % 11) - 5;

function Roundel({ stamp, owned }: { stamp: Stamp; owned: boolean }) {
  const s = STATION[stamp.refId];
  const colors = s.lines.map((l) => LINES[l].color);
  const ink = owned ? colors[0] : "#b9b3a2";
  const name = s.name.length > 18 ? s.name.replace("Massachusetts", "Mass").replace("University", "Univ.").replace("Convention Center", "Conv. Ctr") : s.name;
  const fontSize = Math.min(13.5, 150 / Math.max(8, name.length));
  return (
    <svg viewBox="0 0 120 120" className="size-full" role="img" aria-label={`${s.name} station stamp`}>
      <circle cx="60" cy="60" r="55" fill={owned ? "#fffcf4" : "#f0e9d8"} stroke={ink} strokeWidth="7" strokeDasharray={owned ? undefined : "3 5"} />
      {owned && colors[1] && <circle cx="60" cy="60" r="47.5" fill="none" stroke={colors[1]} strokeWidth="3.5" />}
      {owned && colors[2] && <circle cx="60" cy="60" r="43" fill="none" stroke={colors[2]} strokeWidth="2" />}
      {owned && stamp.rarity !== "common" && (
        <circle cx="60" cy="60" r="39" fill="none" stroke={ink} strokeWidth="0.8" strokeDasharray="1.5 3" opacity="0.7" />
      )}
      <rect x="1" y="45" width="118" height="30" rx="4" fill={owned ? "#1d2320" : "#cfc8b6"} />
      <text x="60" y="64.5" textAnchor="middle" fill="#fff" fontSize={fontSize} fontWeight="700" fontFamily="var(--font-sans)" letterSpacing="-0.2">
        {name}
      </text>
      <text x="60" y="33" textAnchor="middle" fill={ink} fontSize="9.5" fontWeight="700" fontFamily="var(--font-sans)">
        {s.lines.map((l) => (l === "Mattapan" ? "Trolley" : l)).join(" + ")}
      </text>
      <text x="60" y="93" textAnchor="middle" fill={owned ? "#4d564f" : "#a8a290"} fontSize="8.5" fontFamily="var(--font-sans)">
        {s.terminal ? "End of the line" : s.lines.length > 1 ? "Transfer hub" : s.municipality}
      </text>
    </svg>
  );
}

function Postage({ stamp, owned }: { stamp: Stamp; owned: boolean }) {
  const place = PLACE[stamp.refId];
  const photo = photoOf(stamp.refId);
  const ink = RARITY_INK[stamp.rarity];
  return (
    <div className="perforated size-full bg-card p-[9%]" style={{ background: owned ? "#fffcf4" : "#ebe4d2" }}>
      <div className="relative flex size-full flex-col overflow-hidden" style={{ outline: `1.5px solid ${owned ? ink : "#c5bea9"}`, outlineOffset: "2px" }}>
        <div className="relative min-h-0 flex-1" style={{ background: owned ? ink : "#d8d1bd" }}>
          {photo && (
            // eslint-disable-next-line @next/next/no-img-element -- hot-linked Commons thumbnail
            <img
              src={photo.src}
              alt=""
              loading="lazy"
              draggable={false}
              className={cx("size-full object-cover", owned ? "opacity-90 mix-blend-luminosity contrast-125" : "opacity-25 blur-[3px] grayscale")}
            />
          )}
          {owned && <div className="absolute inset-0 mix-blend-soft-light" style={{ background: ink }} />}
          {place.year && owned && (
            <span className="absolute right-[6%] top-[5%] font-display text-[0.8em] font-bold leading-none text-white drop-shadow">{place.year}</span>
          )}
        </div>
        <div className="px-[6%] py-[6%] text-center font-display text-[0.62em] font-bold leading-[1.1]" style={{ color: owned ? ink : "#a39d8a" }}>
          {stamp.name}
        </div>
      </div>
    </div>
  );
}

function Seal({ stamp, owned }: { stamp: Stamp; owned: boolean }) {
  const ink = owned ? RARITY_INK[stamp.rarity] : "#b9b3a2";
  const points = Array.from({ length: 48 }, (_, i) => {
    const r = i % 2 ? 53 : 58;
    const a = (i / 48) * Math.PI * 2;
    return `${60 + r * Math.cos(a)},${60 + r * Math.sin(a)}`;
  }).join(" ");
  const words = stamp.name.split(" ");
  return (
    <svg viewBox="0 0 120 120" className="size-full" role="img" aria-label={`${stamp.name} collection seal`}>
      <polygon points={points} fill={owned ? ink : "#e6dfcc"} />
      <circle cx="60" cy="60" r="46" fill="none" stroke={owned ? "#fffcf4" : "#c9c2ae"} strokeWidth="1.2" />
      <circle cx="60" cy="60" r="42" fill="none" stroke={owned ? "#fffcf4" : "#c9c2ae"} strokeWidth="0.6" strokeDasharray="1 3" />
      {words.map((w, i) => (
        <text key={w} x="60" y={64 + (i - (words.length - 1) / 2) * 15} textAnchor="middle" fill={owned ? "#fffcf4" : "#a39d8a"} fontSize={Math.min(15, 78 / Math.max(5, w.length) * 1.7)} fontWeight="700" fontFamily="var(--font-display)">
          {w}
        </text>
      ))}
    </svg>
  );
}

export function StampArt({ stamp, owned, tilt = true, className }: { stamp: Stamp; owned: boolean; tilt?: boolean; className?: string }) {
  const legendary = owned && stamp.rarity === "legendary";
  return (
    <div
      className={cx("relative", stamp.kind === "landmark" ? "aspect-[4/5]" : "aspect-square", className)}
      style={{ transform: tilt && owned ? `rotate(${tiltOf(stamp.id)}deg)` : undefined, containerType: "inline-size" }}
    >
      {/* cqw resolves against the wrapper above, so stamp text scales with the stamp.
          The drop shadow follows the perforated edge, so it reads on same-coloured cards. */}
      <div className="size-full" style={{ fontSize: "13cqw", filter: stamp.kind === "landmark" ? "drop-shadow(0 1px 1.5px rgb(29 35 32 / 0.35))" : undefined }}>
        {stamp.kind === "station" ? <Roundel stamp={stamp} owned={owned} /> : stamp.kind === "landmark" ? <Postage stamp={stamp} owned={owned} /> : <Seal stamp={stamp} owned={owned} />}
      </div>
      {legendary && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
          <div className="absolute inset-y-0 left-0 w-1/3 animate-sheen bg-gradient-to-r from-transparent via-white/45 to-transparent" />
        </div>
      )}
    </div>
  );
}
