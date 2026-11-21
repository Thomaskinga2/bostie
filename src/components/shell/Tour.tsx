"use client";
// On-screen guide: the first time someone reaches a screen, each feature listed for it
// in lib/guide.ts is spotlighted with a short description beside it.
// A feature is found by its data-tour attribute; the screen says which scene it is with
// data-scene on its root. All wording lives in lib/guide.ts.
import { BookOpen } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { GUIDE_VERSION, TIP, TOUR, type Scene, type Spot } from "@/lib/guide";
import { useStore } from "@/lib/store";
import { Overlay } from "../Sheet";
import { cx } from "../ui";

type Rect = { x: number; y: number; w: number; h: number };

const readScene = () => document.querySelector("#screen [data-scene]")?.getAttribute("data-scene") ?? null;
const watchScene = (onChange: () => void) => {
  const observer = new MutationObserver(onChange);
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-scene"] });
  return () => observer.disconnect();
};
/** The scene currently on screen, read from the DOM so screens only need an attribute. */
export const useScene = () => useSyncExternalStore(watchScene, readScene, () => null);

const PAD = 6;
/** How long to wait for a feature to appear before moving on without it. */
const MISSING_MS = 700;

function Spotlight({ scene, spots }: { scene: string; spots: Spot[] }) {
  const markTips = useStore((s) => s.markTips);
  const skipTips = useStore((s) => s.skipTips);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const scrolled = useRef(-1);
  const spot = spots[i];

  const go = (to: number) => {
    setRect(null);
    if (to >= spots.length) markTips(scene);
    else setI(Math.max(0, to));
  };

  // Follow the feature every frame: it may still be loading, animating or scrolling.
  useEffect(() => {
    let frame = 0;
    const started = performance.now();
    const tick = () => {
      const screen = document.getElementById("screen");
      const el = document.querySelector<HTMLElement>(`#screen [data-tour="${spot.target}"]`);
      if (screen && el && el.offsetParent !== null) {
        if (scrolled.current !== i) {
          scrolled.current = i;
          el.scrollIntoView({ block: "center", behavior: "instant" });
        }
        const s = screen.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        // Clip to the screen, so a tall feature is highlighted where it is visible.
        const top = Math.max(r.top, s.top + 4);
        const bottom = Math.min(r.bottom, s.bottom - 4);
        const next = { x: r.left - s.left - PAD, y: top - s.top - PAD, w: r.width + PAD * 2, h: Math.max(24, bottom - top) + PAD * 2 };
        setRect((cur) => (cur && Math.abs(cur.x - next.x) + Math.abs(cur.y - next.y) + Math.abs(cur.w - next.w) + Math.abs(cur.h - next.h) < 1 ? cur : next));
        setBox((cur) => (cur.w === s.width && cur.h === s.height ? cur : { w: s.width, h: s.height }));
      } else if (performance.now() - started > MISSING_MS) {
        // The feature is not on this screen right now (for example the demo strip outside demo mode).
        if (i + 1 >= spots.length) markTips(scene);
        else setI(i + 1);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [i, spot.target, spots.length, scene, markTips]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") skipTips();
      if (e.key === "ArrowRight" || e.key === "Enter") go(i + 1);
      if (e.key === "ArrowLeft") go(i - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!rect) return <div className="pointer-events-auto absolute inset-0" />; // block taps while locating the feature

  // Put the card on whichever side of the feature has more room.
  const below = rect.y + rect.h / 2 < box.h / 2;
  const caretX = Math.min(box.w - 44, Math.max(28, rect.x + rect.w / 2)) - 16;
  const last = i === spots.length - 1;

  return (
    <>
      {/* Tapping anywhere outside the card moves on. */}
      <div aria-hidden className="pointer-events-auto absolute inset-0" onClick={() => go(i + 1)} />
      <div
        aria-hidden
        className="pointer-events-none absolute rounded-[18px] ring-2 ring-gold transition-all duration-200 ease-out"
        style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, boxShadow: "0 0 0 3000px rgb(20 28 24 / 0.66)" }}
      />
      <div
        role="dialog"
        aria-label="Tip"
        className="pointer-events-auto absolute inset-x-4 rounded-3xl bg-card p-4 shadow-lift transition-all duration-200 ease-out"
        style={below ? { top: Math.min(rect.y + rect.h + 14, box.h - 215) } : { bottom: Math.min(box.h - rect.y + 14, box.h - 215) }}
      >
        <span
          aria-hidden
          className={cx("absolute size-4 rotate-45 bg-card", below ? "-top-2" : "-bottom-2")}
          style={{ left: caretX }}
        />
        <h2 className="text-[19px] font-bold leading-tight">{spot.title}</h2>
        <p className="mt-1.5 text-[15px] leading-snug text-ink-soft">{spot.body}</p>
        <div className="mt-3.5 flex items-center gap-2">
          <span className="text-[13px] font-semibold tabular-nums text-ink-faint">
            {i + 1} of {spots.length}
          </span>
          <button onClick={skipTips} className="ml-1 h-9 px-1 text-[13.5px] font-semibold text-ink-soft underline underline-offset-2">
            {TIP.skip}
          </button>
          <span className="flex-1" />
          {i > 0 && (
            <button onClick={() => go(i - 1)} className="h-9 rounded-full border border-line px-3.5 text-[14px] font-semibold">
              {TIP.back}
            </button>
          )}
          <button onClick={() => go(i + 1)} autoFocus className="h-9 rounded-full bg-forest px-4 text-[14px] font-semibold text-paper">
            {last ? TIP.done : TIP.next}
          </button>
        </div>
      </div>
    </>
  );
}

/** Runs a screen's highlights once per guide version, after any reward reveal has finished. */
export function Tour() {
  const scene = useScene();
  const seen = useStore((s) => (scene ? s.tipsSeen[scene] === GUIDE_VERSION : true));
  const off = useStore((s) => s.tipsOff);
  const rewarding = useStore((s) => s.celebrations.length > 0);
  const spots = scene ? TOUR[scene as Scene] : undefined;
  if (!scene || !spots?.length || seen || off || rewarding) return null;
  return (
    <Overlay>
      <Spotlight key={scene} scene={scene} spots={spots} />
    </Overlay>
  );
}

/** Replays the highlights for the screen the visitor is on. */
export function GuideButton({ className, label = "Guide" }: { className?: string; label?: string }) {
  const replay = useStore((s) => s.replayTips);
  const scene = useScene();
  return (
    <button onClick={() => replay(scene)} className={cx("inline-flex items-center gap-1.5 font-semibold", className)}>
      <BookOpen size={15} aria-hidden /> {label}
    </button>
  );
}
