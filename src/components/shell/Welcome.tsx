"use client";
// The opening: an illustrated platform, train doors that close over the screen and
// slide open, then a quiet "what should we call you?" step.
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { Button } from "../ui";

/** Bostie the Boston terrier: the app's mascot. Full figure and a square face crop live in /public. */
export const MASCOT = { full: "/mascot.webp", face: "/mascot-face.png", alt: "Bostie, a Boston terrier with a backpack and a transit pass" };

/** The brand mark: Bostie's face on a cream tile. */
export function Logo({ size = 44 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- small local asset, sized by the caller
    <img
      src={MASCOT.face}
      alt="Bostie"
      width={size}
      height={size}
      draggable={false}
      className="shrink-0 rounded-[30%] bg-card object-cover ring-1 ring-line"
      style={{ width: size, height: size }}
    />
  );
}

const INK = "#1d2320";
const FOREST = "#1f4b3a";
const GOLD = "#b8862b";
const pen = { fill: "none", stroke: INK, strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
/** A line that draws itself in, like a pencil stroke. */
const draw = (delay: number, duration = 0.6) => ({
  initial: { pathLength: 0, opacity: 0 },
  animate: { pathLength: 1, opacity: 1 },
  transition: { delay, duration, ease: "easeOut" as const },
});

/** A Red Line car pulling into the platform, drawn in ink. The sign reads Boston. */
function PlatformScene() {
  return (
    <svg viewBox="0 0 340 214" className="w-full overflow-visible" role="img" aria-label="A subway train arriving at a platform">
      {/* platform and its tactile edge */}
      <motion.path d="M6 182 H334" {...pen} {...draw(0.1, 0.7)} />
      <motion.path d="M14 190 H326" stroke={GOLD} strokeWidth="3.5" strokeLinecap="round" strokeDasharray="1 9" fill="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5, duration: 0.5 }} />

      {/* station sign, in MBTA style */}
      <motion.g initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45, duration: 0.4 }}>
        <path d="M22 4 V20 M78 4 V20" {...pen} />
        <rect x="8" y="20" width="84" height="26" rx="5" fill={INK} />
        <rect x="8" y="20" width="84" height="6" rx="3" fill="#da291c" />
        <text x="50" y="40" textAnchor="middle" fill="#fff" fontSize="11.5" fontWeight="700" fontFamily="var(--font-sans)">Boston</text>
      </motion.g>

      {/* the train rolls in from the tunnel */}
      <motion.g initial={{ x: -380 }} animate={{ x: 16 }} transition={{ delay: 0.5, type: "spring", stiffness: 42, damping: 13 }}>
        <rect x="34" y="62" width="262" height="112" rx="16" fill="#fffcf4" stroke={INK} strokeWidth="2" />
        <rect x="35" y="146" width="260" height="10" fill="#da291c" />
        <path d="M50 62 q0 -9 12 -9 h206 q12 0 12 9" {...pen} />
        {/* windows */}
        <rect x="50" y="80" width="62" height="46" rx="8" fill="#dfe8d6" stroke={INK} strokeWidth="2" />
        <rect x="218" y="80" width="62" height="46" rx="8" fill="#dfe8d6" stroke={INK} strokeWidth="2" />
        <path d="M60 116 l14 -26 M228 116 l14 -26" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
        {/* doors */}
        <rect x="126" y="72" width="39" height="101" rx="4" fill={FOREST} stroke={INK} strokeWidth="2" />
        <rect x="165" y="72" width="39" height="101" rx="4" fill={FOREST} stroke={INK} strokeWidth="2" />
        <rect x="133" y="82" width="25" height="40" rx="7" fill="#f3e3b8" stroke={INK} strokeWidth="1.6" />
        <rect x="172" y="82" width="25" height="40" rx="7" fill="#f3e3b8" stroke={INK} strokeWidth="1.6" />
        <motion.circle cx="165" cy="65" r="3.4" fill={GOLD} animate={{ opacity: [1, 0.25, 1] }} transition={{ delay: 2, duration: 1.2, repeat: Infinity }} />
      </motion.g>

      {/* platform lamp */}
      <motion.path d="M332 182 V104 q0 -12 -12 -12" {...pen} {...draw(0.6)} />
      <motion.circle cx="319" cy="97" r="6" fill="#f3e3b8" stroke={INK} strokeWidth="2" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.2, type: "spring", stiffness: 300, damping: 14 }} />

      {/* a pigeon, minding its business */}
      <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1, y: [0, -3, 0, 0] }} transition={{ opacity: { delay: 1.5 }, y: { delay: 2.2, duration: 1.1, repeat: Infinity, repeatDelay: 1.8 } }}>
        <ellipse cx="22" cy="170" rx="11" ry="7.5" fill={INK} />
        <circle cx="32" cy="162" r="5" fill={INK} />
        <path d="M36.5 162 l6 1.6 l-6 1.8 z" fill={GOLD} />
        <path d="M19 177 v5 M25 177 v5" {...pen} strokeWidth="1.6" />
        <circle cx="33.5" cy="161" r="1" fill="#fffcf4" />
      </motion.g>

      {/* pencilled note */}
      <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.7, duration: 0.4 }}>
        <text x="232" y="24" textAnchor="middle" fontFamily="var(--font-hand)" fontSize="19" fill="#4d564f" transform="rotate(-5 232 24)">
          doors open when you tap
        </text>
      </motion.g>
      <motion.path d="M208 34 q-24 3 -27 22 m-6 -8 l6 10 l8 -8" {...pen} stroke="#4d564f" strokeWidth="1.6" {...draw(1.9, 0.5)} />
    </svg>
  );
}

/** Bostie pops up and says hello. */
function MascotHello() {
  return (
    <div className="relative mx-auto size-[176px]">
      <motion.div
        className="size-full"
        initial={{ y: 36, opacity: 0, scale: 0.86 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ delay: 0.25, type: "spring", stiffness: 230, damping: 15 }}
      >
        {/* a slow, small bob so he feels alive without pulling focus from the question */}
        <motion.img
          src={MASCOT.full}
          alt={MASCOT.alt}
          draggable={false}
          className="size-full object-contain drop-shadow-[0_6px_10px_rgb(29_35_32/0.18)]"
          animate={{ y: [0, -5, 0] }}
          transition={{ delay: 1.2, duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
        />
      </motion.div>
      <motion.svg
        viewBox="0 0 64 52"
        className="absolute -right-7 top-0 w-[66px]"
        aria-hidden
        style={{ transformOrigin: "10% 90%" }}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.9, type: "spring", stiffness: 320, damping: 15 }}
      >
        <path d="M14 3 h36 q10 0 10 10 v12 q0 10 -10 10 h-26 l-13 12 l4 -12 h-1 q-10 0 -10 -10 v-12 q0 -10 10 -10 z" fill="#fffcf4" stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
        <text x="32" y="27" textAnchor="middle" fontFamily="var(--font-hand)" fontSize="22" fontWeight="700" fill={INK}>hi!</text>
      </motion.svg>
    </div>
  );
}

type Phase = "landing" | "wipe" | "doors" | "open" | "fade" | "name";
/** How long each transition beat lasts before the next begins. */
const BEATS: Partial<Record<Phase, [Phase, number]>> = { wipe: ["doors", 520], doors: ["open", 520], open: ["fade", 820], fade: ["name", 420] };

/** Green floods out from the button, becomes a pair of train doors, and the doors slide open. */
function DoorTransition({ phase, origin, onSkip }: { phase: Phase; origin: { x: number; y: number }; onSkip: () => void }) {
  const opening = phase === "open" || phase === "fade";
  const panel = "absolute inset-y-0 w-1/2 bg-forest";
  const windowBox = "absolute left-[16%] right-[16%] top-[13%] h-[34%] rounded-[30px] border-2 border-paper/30 bg-forest-deep";
  const slide = { duration: 0.8, ease: [0.65, 0, 0.25, 1] as const };
  return (
    <motion.div
      className="absolute inset-0 z-20 overflow-hidden"
      initial={{ clipPath: `circle(0px at ${origin.x}px ${origin.y}px)` }}
      animate={{ clipPath: `circle(160% at ${origin.x}px ${origin.y}px)` }}
      transition={{ duration: 0.52, ease: [0.7, 0, 0.3, 1] }}
      onClick={onSkip}
      aria-hidden
    >
      {/* warm carriage light behind the doors */}
      <motion.div className="absolute inset-0 bg-gold-soft" animate={{ opacity: phase === "fade" ? 0 : 1 }} transition={{ duration: 0.4 }} />

      <motion.div className={`${panel} left-0`} animate={{ x: opening ? "-103%" : 0 }} transition={slide}>
        <div className="absolute inset-3 right-0 rounded-l-[26px] border border-r-0 border-paper/20" />
        <motion.div className={windowBox} initial={{ opacity: 0 }} animate={{ opacity: phase === "wipe" ? 0 : 1 }} />
        <div className="absolute inset-y-0 right-0 w-[7px] bg-forest-deep" />
      </motion.div>
      <motion.div className={`${panel} right-0`} animate={{ x: opening ? "103%" : 0 }} transition={slide}>
        <div className="absolute inset-3 left-0 rounded-r-[26px] border border-l-0 border-paper/20" />
        <motion.div className={windowBox} initial={{ opacity: 0 }} animate={{ opacity: phase === "wipe" ? 0 : 1 }} />
        <div className="absolute inset-y-0 left-0 w-[7px] bg-forest-deep" />
      </motion.div>

      <motion.p
        className="absolute inset-x-0 top-[58%] flex items-center justify-center gap-2.5 text-[17px] font-semibold text-paper"
        initial={{ opacity: 0 }}
        animate={{ opacity: phase === "doors" ? 1 : 0 }}
        transition={{ duration: 0.2 }}
      >
        <span className="size-2.5 animate-pulse rounded-full bg-gold" /> Doors opening
      </motion.p>
    </motion.div>
  );
}

export function Welcome() {
  const onboard = useStore((s) => s.onboard);
  const setName = useStore((s) => s.setName);
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("landing");
  const [origin, setOrigin] = useState({ x: 200, y: 600 });
  const [name, setLocal] = useState("");

  // Step through the door animation, one beat at a time.
  useEffect(() => {
    const beat = BEATS[phase];
    if (!beat) return;
    const t = setTimeout(() => setPhase(beat[0]), beat[1]);
    return () => clearTimeout(t);
  }, [phase]);

  const board = (e: React.MouseEvent<HTMLButtonElement>) => {
    const button = e.currentTarget.getBoundingClientRect();
    const main = e.currentTarget.closest("[data-welcome]")?.getBoundingClientRect();
    if (main) setOrigin({ x: button.left + button.width / 2 - main.left, y: button.top + button.height / 2 - main.top });
    setPhase(reduced ? "name" : "wipe");
  };

  const finish = () => {
    if (name.trim()) setName(name);
    // Demo mode is chosen in Settings (or beside the phone frame), so replaying the intro keeps it as it was.
    onboard(useStore.getState().demo);
  };

  const showName = phase === "open" || phase === "fade" || phase === "name";

  return (
    <div data-welcome className="relative h-full overflow-hidden">
      {!showName && (
        <div className="scroll-area flex h-full flex-col px-6 pb-7 pt-6">
          <div className="flex items-center gap-2.5">
            <Logo size={34} />
            <span className="font-display text-[21px] font-bold">Bostie</span>
          </div>

          <motion.h1
            className="mt-7 text-[40px] font-bold leading-[1.02]"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          >
            Make every ride <em className="font-normal">an adventure.</em>
          </motion.h1>
          <motion.p
            className="mt-3 max-w-[30ch] text-[16px] leading-relaxed text-ink-soft"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25, duration: 0.5 }}
          >
            Use Bostie to explore the city, collect a stamp at every station, and have fun all the way with our game.
          </motion.p>

          <div className="my-auto py-5">
            <PlatformScene />
          </div>

          <motion.div className="relative space-y-2.5" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9, duration: 0.4 }}>
            {/* Bostie peeks up from behind the button once the train is in */}
            <div aria-hidden className="pointer-events-none absolute -top-[92px] right-3 h-[96px] w-[104px] overflow-hidden">
              <motion.img
                src={MASCOT.full}
                alt=""
                draggable={false}
                className="w-full"
                initial={{ y: 110 }}
                animate={{ y: 0 }}
                transition={{ delay: 1.9, type: "spring", stiffness: 200, damping: 16 }}
              />
            </div>
            <Button size="lg" className="relative w-full" onClick={board} disabled={phase !== "landing"}>
              Start exploring
            </Button>
            <p className="text-center text-[13px] text-ink-faint">No account needed. Nothing to install.</p>
          </motion.div>
        </div>
      )}

      {showName && (
        <form
          className="scroll-area flex h-full flex-col items-center px-7 pb-7 pt-10 text-center"
          onSubmit={(e) => {
            e.preventDefault();
            finish();
          }}
        >
          <div className="my-auto w-full">
            <MascotHello />
            <motion.h1
              id="name-question"
              className="mt-5 text-[32px] font-bold leading-[1.08]"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.45 }}
            >
              What should <em className="font-normal">we call you?</em>
            </motion.h1>
            <p className="mt-2 text-[15px] text-ink-soft">Only so your passport has a name on it.</p>

            <div className="relative mx-auto mt-8 w-full max-w-[270px] pb-16">
              <input
                aria-labelledby="name-question"
                value={name}
                onChange={(e) => setLocal(e.target.value)}
                placeholder="Your first name"
                maxLength={24}
                autoComplete="given-name"
                enterKeyHint="go"
                // The underline changes colour on focus, so the default outline box is dropped here.
                style={{ outline: "none" }}
                className="h-14 w-full border-b-2 border-ink/60 bg-transparent text-center font-display text-[26px] placeholder:italic placeholder:text-ink-faint focus:border-forest"
              />
              <motion.svg viewBox="0 0 200 56" className="absolute bottom-1 left-[38%] w-[200px]" aria-hidden initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.3 }}>
                <motion.path d="M30 40 q-20 -4 -17 -30 m-7 9 l7 -10 l8 8" {...pen} stroke="#4d564f" strokeWidth="1.6" {...draw(1.4, 0.5)} />
                <text x="38" y="46" fontFamily="var(--font-hand)" fontSize="20" fill="#4d564f" transform="rotate(-4 38 46)">nicknames welcome</text>
              </motion.svg>
            </div>
          </div>

          <div className="w-full space-y-2.5">
            <Button type="submit" size="lg" className="w-full">Continue</Button>
            <p className="text-[13px] leading-snug text-ink-faint">
              Next: your map of Boston, with live MBTA departures.
            </p>
          </div>
        </form>
      )}

      {phase !== "landing" && phase !== "name" && <DoorTransition phase={phase} origin={origin} onSkip={() => setPhase("name")} />}
    </div>
  );
}
