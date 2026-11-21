"use client";
import { motion } from "motion/react";
import { useState } from "react";
import { STAMP } from "@/lib/gamification";
import { useStore } from "@/lib/store";
import { StampArt } from "../Stamp";
import { Button } from "../ui";

export function Logo({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="TQuest">
      <circle cx="24" cy="24" r="22" fill="#1f4b3a" />
      <circle cx="24" cy="24" r="17.5" fill="none" stroke="#f5efe0" strokeWidth="1" strokeDasharray="1.2 2.6" />
      <path d="M13 15.5h22v5.2H27v16h-6v-16h-8z" fill="#f5efe0" />
      <circle cx="35.5" cy="34" r="3.2" fill="#b8862b" />
    </svg>
  );
}

const SHOWN = ["station:place-harsq", "landmark:state-house", "station:place-pktrm"];

export function Welcome() {
  const onboard = useStore((s) => s.onboard);
  const setName = useStore((s) => s.setName);
  const [name, setLocal] = useState("");
  const go = (demo: boolean) => {
    if (name.trim()) setName(name);
    onboard(demo);
  };
  return (
    <div className="scroll-area flex h-full flex-col px-6 pb-8 pt-6">
      <div className="flex items-center gap-2.5">
        <Logo size={36} />
        <span className="font-display text-[22px] font-bold">TQuest</span>
      </div>

      <div className="relative mx-auto mt-6 h-[190px] w-full max-w-[320px]" aria-hidden>
        {SHOWN.map((id, i) => (
          <motion.div
            key={id}
            className="absolute top-2"
            style={{ left: `${[2, 33, 62][i]}%`, width: i === 1 ? "35%" : "36%", top: i === 1 ? 0 : 34, zIndex: i === 1 ? 2 : 1 }}
            initial={{ opacity: 0, scale: 1.7, rotate: [-18, 8, 16][i] }}
            animate={{ opacity: 1, scale: 1, rotate: [-9, 3, 8][i] }}
            transition={{ type: "spring", stiffness: 380, damping: 20, delay: 0.15 + i * 0.16 }}
          >
            <StampArt stamp={STAMP[id]} owned tilt={false} />
          </motion.div>
        ))}
      </div>

      <h1 className="mt-4 text-[38px] font-bold leading-[1.02]">Make every ride an adventure.</h1>
      <p className="mt-3 text-[16px] leading-relaxed text-ink-soft">
        Ride the T, collect a stamp at every station, and let Gemini verify the landmarks you find along the way.
      </p>

      <label className="mt-6 block text-[14px] font-semibold text-ink-soft" htmlFor="player-name">
        What should we call you?
      </label>
      <input
        id="player-name"
        value={name}
        onChange={(e) => setLocal(e.target.value)}
        placeholder="Explorer"
        maxLength={24}
        autoComplete="given-name"
        className="mt-1.5 h-12 w-full rounded-2xl border border-line bg-card px-4 text-[16px] placeholder:text-ink-faint"
      />

      <div className="mt-auto space-y-2.5 pt-6">
        <Button size="lg" className="w-full" onClick={() => go(true)}>
          Start the guided demo
        </Button>
        <Button size="lg" variant="secondary" className="w-full" onClick={() => go(false)}>
          Explore on my own
        </Button>
        <p className="pt-1 text-center text-[13px] text-ink-faint">
          No account needed. The demo simulates a Harvard to Park Street ride; Gemini calls are real.
        </p>
      </div>
    </div>
  );
}
