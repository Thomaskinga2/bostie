"use client";
import { Bookmark, BookmarkCheck, Search } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { RARITY_INK, rarityLabel, RarityPips, StampArt } from "@/components/Stamp";
import { Button, cx, Empty, LineDots, Meter, Photo, shortDate } from "@/components/ui";
import { RARITIES, STAMP, STAMPS, type Derived, type Rarity, type Stamp } from "@/lib/gamification";
import { LINES, MAIN_LINES, STATION, type LineId } from "@/lib/network";
import { PLACE } from "@/lib/places";
import { useStore } from "@/lib/store";
import { Chip, linkButton, SectionTitle } from "./bits";

type Kind = Stamp["kind"];
type Status = "all" | "owned" | "locked";
const KINDS: { id: Kind; label: string }[] = [
  { id: "station", label: "Stations" },
  { id: "landmark", label: "Landmarks" },
  { id: "set", label: "Collections" },
];
const PAGE = 30;

function howCollected(stamp: Stamp, d: Derived): string {
  if (stamp.kind === "station") {
    const via = d.stations.get(stamp.refId)?.via;
    return via === "demo" ? "Collected on a demo ride" : via === "manual" ? "Collected by manual check-in" : "Collected on a guided ride";
  }
  if (stamp.kind === "landmark") {
    const v = d.landmarks.get(stamp.refId)?.verification;
    return v === "nearby" ? "Verified by photo and location" : v === "simulated" ? "Verified by photo at a simulated demo position" : "Verified by photo only";
  }
  return "Every stamp in the collection is yours";
}

function StampDetail({ stamp, d, onClose }: { stamp: Stamp; d: Derived; onClose: () => void }) {
  const saved = useStore((s) => s.saved.includes(stamp.refId));
  const toggleSaved = useStore((s) => s.toggleSaved);
  const at = d.stamps[stamp.id];
  const owned = at !== undefined;
  const place = stamp.kind === "landmark" ? PLACE[stamp.refId] : null;
  const station = stamp.kind === "station" ? STATION[stamp.refId] : null;

  return (
    <div className="pb-2">
      <div className="grid place-items-center py-3">
        <StampArt stamp={stamp} owned={owned} className={stamp.kind === "landmark" ? "w-[150px]" : "w-[168px]"} />
      </div>

      <p className="flex items-center justify-center gap-2 text-[14px] text-ink-soft">
        {station && <LineDots lines={station.lines} />}
        {stamp.subtitle}
      </p>
      <p className="mt-2 flex items-center justify-center gap-2 text-[14px] font-semibold" style={{ color: RARITY_INK[stamp.rarity] }}>
        <RarityPips rarity={stamp.rarity} /> {rarityLabel(stamp.rarity)}
      </p>
      <p className="mx-auto mt-1 max-w-[30ch] text-center text-[14px] text-ink-soft">{stamp.rule}</p>

      {owned ? (
        <dl className="mt-5 divide-y divide-line border-y border-line text-[14.5px]">
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-ink-soft">Collected</dt>
            <dd className="font-semibold">{shortDate(at)}</dd>
          </div>
          <div className="flex justify-between gap-4 py-3">
            <dt className="shrink-0 text-ink-soft">How</dt>
            <dd className="text-right font-semibold">{howCollected(stamp, d)}</dd>
          </div>
        </dl>
      ) : (
        <div className="mt-5 rounded-2xl bg-paper p-4">
          <h3 className="text-[17px] font-bold">How to get it</h3>
          <p className="mt-1 text-[14.5px] leading-relaxed text-ink-soft">
            {stamp.kind === "station"
              ? "Ride to it, or through it, on a guided journey. Confirm each arrival and the stamp is yours."
              : stamp.kind === "landmark"
                ? "Find it in the city and scan it with the camera. Gemini checks the photo before the stamp unlocks."
                : stamp.rule}
          </p>
          {stamp.kind === "landmark" && (
            <Link href="/scan" onClick={onClose} className={cx(linkButton, "mt-3")}>
              Open the scanner
            </Link>
          )}
          {stamp.kind === "station" && (
            <Link href="/" onClick={onClose} className={cx(linkButton, "mt-3")}>
              Plan a journey
            </Link>
          )}
        </div>
      )}

      {place && (
        <div className="mt-5">
          <Photo id={place.id} alt={place.name} className="h-44 rounded-2xl" />
          <p className="mt-3 text-[15px] leading-relaxed text-ink">{place.summary}</p>
        </div>
      )}

      {stamp.kind !== "set" && (
        <Button variant="secondary" className="mt-5 w-full" onClick={() => toggleSaved(stamp.refId)} aria-pressed={saved}>
          {saved ? <BookmarkCheck size={18} aria-hidden /> : <Bookmark size={18} aria-hidden />}
          {saved ? "Saved to your places" : "Save this place"}
        </Button>
      )}
    </div>
  );
}

export function Stamps({ d }: { d: Derived }) {
  const [kind, setKind] = useState<Kind>("station");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status>("all");
  const [rarity, setRarity] = useState<Rarity | null>(null);
  const [line, setLine] = useState<LineId | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const ofKind = useMemo(() => STAMPS.filter((s) => s.kind === kind), [kind]);
  const have = ofKind.filter((s) => s.id in d.stamps).length;
  const rarities = RARITIES.filter((r) => ofKind.some((s) => s.rarity === r));

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ofKind
      .filter((s) => {
        const owned = s.id in d.stamps;
        return (
          (!q || s.name.toLowerCase().includes(q) || s.subtitle.toLowerCase().includes(q)) &&
          (status === "all" || (status === "owned") === owned) &&
          (!rarity || s.rarity === rarity) &&
          (!line || s.kind !== "station" || STATION[s.refId].lines.includes(line))
        );
      })
      // collected first, most recent first; locked keep catalogue order (sort is stable)
      .sort((a, b) => (d.stamps[b.id] ?? 0) - (d.stamps[a.id] ?? 0));
  }, [ofKind, d.stamps, query, status, rarity, line]);

  const visible = showAll ? shown : shown.slice(0, PAGE);
  const stamp = selected ? STAMP[selected] : null;
  const switchKind = (k: Kind) => {
    setKind(k);
    setRarity(null);
    setLine(null);
    setShowAll(false);
  };

  return (
    <section className="px-5 pt-7" aria-labelledby="stamps-title">
      <div id="stamps-title">
        <SectionTitle title="Stamps" sub="One for every station you ride through and every landmark you verify." />
      </div>

      <div role="tablist" aria-label="Stamp type" className="mt-4 flex rounded-full bg-sand p-1">
        {KINDS.map((k) => (
          <button
            key={k.id}
            role="tab"
            aria-selected={kind === k.id}
            onClick={() => switchKind(k.id)}
            className={cx("relative h-10 flex-1 rounded-full text-[14.5px] font-semibold", kind === k.id ? "text-ink" : "text-ink-soft")}
          >
            {kind === k.id && (
              <motion.span layoutId="stamp-kind" className="absolute inset-0 rounded-full bg-card shadow-card" transition={{ type: "spring", stiffness: 500, damping: 38 }} />
            )}
            <span className="relative">{k.label}</span>
          </button>
        ))}
      </div>

      <div className="mt-4">
        <div className="flex items-baseline justify-between text-[14px]">
          <span className="font-semibold">
            {have} of {ofKind.length} collected
          </span>
          <span className="text-ink-faint">{Math.round((have / ofKind.length) * 100)}%</span>
        </div>
        <Meter value={have / ofKind.length} className="mt-1.5" color="var(--color-gold)" />
      </div>

      <label className="relative mt-4 block">
        <span className="sr-only">Search stamps</span>
        <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={kind === "station" ? "Search stations" : kind === "landmark" ? "Search landmarks" : "Search collections"}
          className="h-11 w-full rounded-full border border-line bg-card pl-10 pr-4 text-[16px] placeholder:text-ink-faint"
        />
      </label>

      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filters">
        {(["all", "owned", "locked"] as Status[]).map((s) => (
          <Chip key={s} active={status === s} onClick={() => setStatus(s)}>
            {s === "all" ? "All" : s === "owned" ? "Collected" : "Locked"}
          </Chip>
        ))}
        {rarities.length > 1 &&
          rarities.map((r) => (
            <Chip key={r} active={rarity === r} onClick={() => setRarity(rarity === r ? null : r)} color={RARITY_INK[r]}>
              {rarityLabel(r)}
            </Chip>
          ))}
        {kind === "station" &&
          MAIN_LINES.map((l) => (
            <Chip key={l} active={line === l} onClick={() => setLine(line === l ? null : l)} color={LINES[l].color}>
              {l}
            </Chip>
          ))}
      </div>

      {shown.length === 0 ? (
        <div className="mt-5">
          <Empty
            title="No stamps match"
            body="Try a different search or clear the filters."
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setQuery("");
                  setStatus("all");
                  setRarity(null);
                  setLine(null);
                }}
              >
                Clear filters
              </Button>
            }
          />
        </div>
      ) : (
        <ul className="mt-5 grid grid-cols-3 items-center gap-x-4 gap-y-5">
          {visible.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => setSelected(s.id)}
                aria-label={`${s.name}, ${rarityLabel(s.rarity)}, ${s.id in d.stamps ? "collected" : "locked"}`}
                className="block w-full rounded-2xl transition active:scale-95"
              >
                <StampArt stamp={s} owned={s.id in d.stamps} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {shown.length > PAGE && (
        <div className="mt-5 text-center">
          <Button variant="secondary" size="sm" onClick={() => setShowAll(!showAll)}>
            {showAll ? "Show fewer" : `Show all ${shown.length}`}
          </Button>
        </div>
      )}

      <Sheet open={!!stamp} onClose={() => setSelected(null)} title={stamp?.name} tall={stamp?.kind === "landmark"}>
        {stamp && <StampDetail stamp={stamp} d={d} onClose={() => setSelected(null)} />}
      </Sheet>
    </section>
  );
}
