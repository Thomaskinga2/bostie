"use client";
// The two AI ways to start a trip: from a video, screenshot or link (Social-to-Trip), and
// from interests, budget and time (the generator). Both end with verified places only.
import { Check, Clapperboard, ImagePlus, Link2, Sparkles, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { StationSelect } from "@/components/StationSelect";
import { Bostie } from "@/components/games/GameChrome";
import { Button, cx } from "@/components/ui";
import { ApiError, post, toJpegBase64 } from "@/lib/api";
import type { TripGenerateResponse, TripImportResponse, TripStop } from "@/lib/contracts";
import { INTERESTS } from "@/data/discover";
import { STATION } from "@/lib/network";
import { useStore } from "@/lib/store";
import { orderStops, useTrips } from "@/lib/trips";
import { PlacePhoto, priceText } from "./PlacePhoto";

/** Still frames spread evenly through a video, taken in the browser: the video itself never leaves the phone. */
export async function videoFrames(file: File, count = 8): Promise<{ base64: string; dataUrl: string }[]> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = URL.createObjectURL(file);
  try {
    await new Promise<void>((ok, bad) => {
      video.onloadeddata = () => ok();
      video.onerror = () => bad(new Error("unreadable"));
      setTimeout(() => bad(new Error("timeout")), 15_000);
    });
    const length = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
    const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight, 1));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const frames: { base64: string; dataUrl: string }[] = [];
    for (let i = 0; i < count; i++) {
      await new Promise<void>((ok) => {
        video.onseeked = () => ok();
        setTimeout(ok, 2500); // some phones never fire `seeked` on a still frame
        video.currentTime = Math.min(length - 0.05, (length * (i + 0.5)) / count);
      });
      canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
      frames.push({ base64: dataUrl.split(",")[1], dataUrl });
    }
    return frames;
  } finally {
    URL.revokeObjectURL(video.src);
  }
}

const WORKING = ["Looking through every frame…", "Reading signs and captions…", "Naming the places…", "Checking each one on the map…"];
const PLANNING = ["Reading what you like…", "Picking places that fit…", "Putting them in a sensible order…", "Checking each one on the map…"];

/** What is shown while Gemini works: Bostie, a line that changes, and the shape of what is coming. */
function Working({ lines, thumbs }: { lines: string[]; thumbs?: string[] }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((x) => (x + 1) % lines.length), 1600);
    return () => clearInterval(t);
  }, [lines.length]);
  return (
    <div role="status" aria-live="polite" data-testid="trip-working">
      <Bostie mood="thinking" say={lines[n]} size={64} />
      {!!thumbs?.length && (
        <div className="mt-3 flex gap-1.5 overflow-hidden rounded-2xl">
          {thumbs.slice(0, 8).map((src, i) => (
            <motion.img key={i} src={src} alt="" className="h-16 min-w-0 flex-1 object-cover" initial={{ opacity: 0.25 }} animate={{ opacity: [0.25, 1, 0.25] }} transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.18 }} />
          ))}
        </div>
      )}
      <div className="mt-4 space-y-2.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <motion.div key={i} className="flex items-center gap-3 rounded-2xl border border-line bg-card p-2.5" animate={{ opacity: [0.45, 1, 0.45] }} transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.22 }}>
            <div className="size-16 shrink-0 rounded-xl bg-sand" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3.5 w-2/3 rounded-full bg-sand" />
              <div className="h-3 w-1/2 rounded-full bg-sand" />
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

const Segment = <T extends string | number>({ label, options, value, onChange }: { label: string; options: readonly (readonly [T, string])[]; value: T; onChange: (v: T) => void }) => (
  <div role="radiogroup" aria-label={label} className="flex rounded-full bg-sand p-1">
    {options.map(([id, text]) => (
      <button key={String(id)} role="radio" aria-checked={value === id} onClick={() => onChange(id)} className={cx("h-9 min-w-0 flex-1 truncate rounded-full px-2 text-[13.5px] font-semibold", value === id ? "bg-card text-ink shadow-card" : "text-ink-soft")}>
        {text}
      </button>
    ))}
  </div>
);

/** Social-to-Trip. `onDone` gets the new trip's id. */
export function ImportTrip({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const create = useTrips((s) => s.create);
  const logAi = useStore((s) => s.logAi);
  const [source, setSource] = useState<"link" | "video" | "shots">("link");
  const [link, setLink] = useState("");
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<TripImportResponse | null>(null);
  const [off, setOff] = useState<string[]>([]);
  const [start, setStart] = useState("place-pktrm");

  const run = async (body: { images?: string[]; youtube?: string }) => {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const res = await post<TripImportResponse>("/api/trips/import", body, 70_000);
      if (res.meta) logAi(res.meta, { found: res.found.map((f) => f.name), skipped: res.skipped }, `${res.found.length} verified place(s) kept; unverified names were dropped`);
      setResult(res);
      setOff([]);
    } catch (e) {
      setError(e instanceof ApiError && e.message ? e.message : "That did not work. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };
  const fromFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setError("");
    setBusy(true);
    try {
      const frames = source === "video" ? await videoFrames(files[0]) : await Promise.all([...files].slice(0, 4).map((f) => toJpegBase64(f, 1024)));
      setThumbs(frames.map((f) => f.dataUrl));
      await run({ images: frames.map((f) => f.base64) });
    } catch {
      setBusy(false);
      setError(source === "video" ? "This phone could not read that video. Try a screenshot of it instead." : "Those images could not be read. Try another screenshot.");
    }
  };

  const kept = (result?.found ?? []).filter((f) => !off.includes(f.id));
  const make = () => {
    const ordered = orderStops(STATION[start], kept);
    create({ name: result?.summary ? result.summary.slice(0, 48) : "Imported trip", origin: "import", startStationId: start, days: [ordered] });
    onDone();
  };

  return (
    <div data-testid="trip-import">
      <div className="flex items-center justify-between">
        <h2 className="text-[24px] font-bold">Spot it, save it</h2>
        <button onClick={onCancel} aria-label="Close" className="grid size-9 place-items-center rounded-full bg-sand text-ink-soft"><X size={18} /></button>
      </div>
      <p className="mt-1 text-[14.5px] leading-snug text-ink-soft">Give Bostie a travel video, a screenshot or a YouTube link. It finds the places and checks each one is real.</p>

      {busy ? (
        <div className="mt-4"><Working lines={WORKING} thumbs={thumbs} /></div>
      ) : result ? (
        <div className="mt-4">
          <p className="rounded-2xl bg-moss px-4 py-3 text-[14.5px] leading-snug text-forest-deep">{result.summary}</p>
          {result.found.length ? (
            <>
              <h3 className="mt-4 text-[18px] font-bold">{result.found.length} place{result.found.length === 1 ? "" : "s"} found</h3>
              <ul className="mt-2 space-y-2" aria-label="Places found">
                <AnimatePresence initial>
                  {result.found.map((p, i) => {
                    const on = !off.includes(p.id);
                    return (
                      <motion.li key={p.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
                        <button role="checkbox" aria-checked={on} onClick={() => setOff(on ? [...off, p.id] : off.filter((x) => x !== p.id))} className={cx("flex w-full items-center gap-3 rounded-2xl border bg-card p-2.5 text-left", on ? "border-forest" : "border-line opacity-60")}>
                          <PlacePhoto place={p} className="size-16 shrink-0 rounded-xl" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[16px] font-bold">{p.name}</span>
                            <span className="block truncate text-[13px] text-ink-soft">{[p.category, priceText(p)].filter(Boolean).join(" · ") || p.address}</span>
                            {p.why && <span className="block truncate text-[12.5px] text-ink-faint">Seen: {p.why}</span>}
                          </span>
                          <span className={cx("grid size-7 shrink-0 place-items-center rounded-full border-2", on ? "border-forest bg-forest text-paper" : "border-line")}>{on && <Check size={14} strokeWidth={3.5} aria-hidden />}</span>
                        </button>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            </>
          ) : (
            <p className="mt-4 text-[15px] text-ink-soft">Bostie could not find a place it could verify in that. Try a clearer screenshot, or one that shows a name or a sign.</p>
          )}
          {result.skipped.length > 0 && (
            <p className="mt-3 text-[13px] leading-snug text-ink-soft" data-testid="trip-skipped">
              <strong className="text-ink">Left out:</strong> {result.skipped.map((s) => s.name).join(", ")}. Bostie could not find {result.skipped.length === 1 ? "it" : "them"} in Greater Boston, and only plans trips there.
            </p>
          )}
          {kept.length > 0 && (
            <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-card"><StationSelect label="From" value={start} onChange={setStart} /></div>
          )}
          <div className="mt-4 space-y-2">
            <Button size="lg" className="w-full" disabled={!kept.length} onClick={make}>Make a trip from {kept.length} place{kept.length === 1 ? "" : "s"}</Button>
            <Button variant="quiet" className="w-full" onClick={() => (setResult(null), setThumbs([]))}>Try something else</Button>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <Segment label="Import from" value={source} onChange={(v) => (setSource(v), setError(""))} options={[["link", "Link"], ["video", "Video"], ["shots", "Screenshots"]] as const} />
          {source === "link" ? (
            <form className="mt-3" onSubmit={(e) => (e.preventDefault(), link.trim() && run({ youtube: link.trim() }))}>
              <label className="flex h-12 items-center gap-2.5 rounded-2xl border border-line bg-card px-3.5">
                <Link2 size={18} className="shrink-0 text-ink-soft" aria-hidden />
                <input value={link} onChange={(e) => setLink(e.target.value)} aria-label="Video link" placeholder="Paste a YouTube link" inputMode="url" autoComplete="off" className="min-w-0 flex-1 bg-transparent text-[16px] placeholder:text-ink-faint" style={{ outline: "none" }} />
              </label>
              <p className="mt-2 text-[13px] leading-snug text-ink-soft">YouTube links work directly. TikTok and Instagram do not let apps open their videos, so for those use Video or Screenshots.</p>
              <Button size="lg" className="mt-3 w-full" disabled={!link.trim()}><Sparkles size={18} aria-hidden /> Find the places</Button>
            </form>
          ) : (
            <label className="mt-3 flex cursor-pointer flex-col items-center gap-2 rounded-3xl border-2 border-dashed border-line bg-card px-5 py-8 text-center">
              {source === "video" ? <Clapperboard size={30} className="text-forest" aria-hidden /> : <ImagePlus size={30} className="text-forest" aria-hidden />}
              <span className="text-[16.5px] font-bold">{source === "video" ? "Choose a video" : "Choose up to 4 screenshots"}</span>
              <span className="text-[13px] leading-snug text-ink-soft">
                {source === "video" ? "A saved TikTok or Reel works. Bostie looks at 8 still frames taken on your phone; the video itself is not uploaded, and its sound is not used." : "Screenshots of a post, a map or a list of places."}
              </span>
              <input type="file" accept={source === "video" ? "video/*" : "image/*"} multiple={source === "shots"} className="sr-only" aria-label={source === "video" ? "Video file" : "Screenshot files"} onChange={(e) => fromFiles(e.target.files)} />
            </label>
          )}
        </div>
      )}
      {error && !busy && <p role="alert" className="mt-3 rounded-2xl bg-gold-soft px-4 py-3 text-[14px] font-semibold text-[#5b410b]">{error}</p>}
    </div>
  );
}

const MORE_INTERESTS = [["food", "Food"], ["art", "Art and museums"], ["coffee", "Coffee"], ["shopping", "Shopping"]] as const;

/** The AI trip generator. */
export function GenerateTrip({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const create = useTrips((s) => s.create);
  const logAi = useStore((s) => s.logAi);
  const [interests, setInterests] = useState<string[]>(["history"]);
  const [budget, setBudget] = useState(1);
  const [days, setDays] = useState(1);
  const [hours, setHours] = useState(6);
  const [start, setStart] = useState("place-pktrm");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const plan = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await post<TripGenerateResponse>("/api/trips/generate", { interests, budget, days, hours, startStationId: start, note: note.trim() || undefined }, 70_000);
      if (res.meta) logAi(res.meta, { title: res.title, days: res.days.map((d) => d.map((s) => s.name)), skipped: res.skipped }, "Only places verified by a lookup were kept; order and travel are worked out by code");
      const ordered: TripStop[][] = res.days.map((d) => orderStops(STATION[start], d));
      create({ name: res.source === "rules" ? `${res.title} (picked by Bostie's rules)` : res.title, origin: "ai", startStationId: start, days: ordered });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError && e.message ? e.message : "Bostie could not plan that trip just now. Try again.");
      setBusy(false);
    }
  };

  if (busy) return <div data-testid="trip-generate"><h2 className="text-[24px] font-bold">Planning your trip</h2><div className="mt-4"><Working lines={PLANNING} /></div></div>;
  return (
    <div data-testid="trip-generate">
      <div className="flex items-center justify-between">
        <h2 className="text-[24px] font-bold">Plan it for me</h2>
        <button onClick={onCancel} aria-label="Close" className="grid size-9 place-items-center rounded-full bg-sand text-ink-soft"><X size={18} /></button>
      </div>
      <p className="mt-1 text-[14.5px] leading-snug text-ink-soft">Tell Bostie what you like. Gemini drafts the days; every place is checked on the map before you see it.</p>

      <h3 className="mt-4 text-[15px] font-bold">What are you into?</h3>
      <div role="group" aria-label="Interests" className="mt-2 flex flex-wrap gap-2">
        {[...INTERESTS.map((i) => [i.id, i.label] as const), ...MORE_INTERESTS].map(([id, label]) => {
          const on = interests.includes(id);
          return (
            <button key={id} aria-pressed={on} onClick={() => setInterests(on ? interests.filter((x) => x !== id) : [...interests, id])} className={cx("h-10 rounded-full border px-4 text-[14.5px] font-semibold", on ? "border-forest bg-forest text-paper" : "border-line bg-card")}>
              {label}
            </button>
          );
        })}
      </div>

      <h3 className="mt-4 text-[15px] font-bold">Budget</h3>
      <div className="mt-2"><Segment label="Budget" value={budget} onChange={setBudget} options={[[0, "Free"], [1, "Low"], [2, "Medium"], [3, "Splurge"]] as const} /></div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <h3 className="text-[15px] font-bold">Days</h3>
          <div className="mt-2"><Segment label="Days" value={days} onChange={setDays} options={[[1, "1"], [2, "2"], [3, "3"]] as const} /></div>
        </div>
        <div>
          <h3 className="text-[15px] font-bold">Time each day</h3>
          <div className="mt-2"><Segment label="Time each day" value={hours} onChange={setHours} options={[[3, "3 h"], [6, "6 h"], [9, "9 h"]] as const} /></div>
        </div>
      </div>
      <h3 className="mt-4 text-[15px] font-bold">Starting from</h3>
      <div className="mt-2 overflow-hidden rounded-2xl border border-line bg-card"><StationSelect label="From" value={start} onChange={setStart} /></div>
      <label className="mt-4 block">
        <span className="text-[15px] font-bold">Anything else? <span className="font-normal text-ink-faint">Optional</span></span>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="With kids, loves bookshops, no seafood…" className="mt-2 h-12 w-full rounded-2xl border border-line bg-card px-3.5 text-[16px] placeholder:text-ink-faint" />
      </label>
      {error && <p role="alert" className="mt-3 rounded-2xl bg-gold-soft px-4 py-3 text-[14px] font-semibold text-[#5b410b]">{error}</p>}
      <Button size="lg" className="mt-4 w-full" onClick={plan}><Sparkles size={18} aria-hidden /> Plan my trip</Button>
    </div>
  );
}
