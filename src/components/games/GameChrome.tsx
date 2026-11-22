"use client";
// Shared by every Bostie's Favourite game: the mascot with his speech bubble, and the
// header with Exit, progress and the sound switch.
import { ChevronLeft, Volume2, VolumeX } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "@/components/ui";
import { sfx } from "@/lib/sound";
import { useStore } from "@/lib/store";

export type Mood = "welcome" | "thinking" | "cheer" | "oops" | "hurry" | "win" | "lose";

const MOVES: Record<Mood, { animate: Record<string, number[]>; duration: number; repeat: number }> = {
  welcome: { animate: { y: [0, -8, 0], rotate: [0, -6, 6, 0] }, duration: 0.9, repeat: 0 },
  thinking: { animate: { rotate: [0, -7, 0, 7, 0] }, duration: 2.6, repeat: Infinity },
  cheer: { animate: { y: [0, -16, 0, -8, 0], scale: [1, 1.12, 1] }, duration: 0.7, repeat: 0 },
  oops: { animate: { x: [0, -7, 7, -5, 5, 0], rotate: [0, -8, 8, 0] }, duration: 0.5, repeat: 0 },
  hurry: { animate: { y: [0, -5, 0] }, duration: 0.32, repeat: Infinity },
  win: { animate: { y: [0, -18, 0], rotate: [0, -12, 12, -8, 0], scale: [1, 1.18, 1] }, duration: 0.9, repeat: 2 },
  lose: { animate: { rotate: [0, 14], y: [0, 5] }, duration: 0.5, repeat: 0 },
};

/** Bostie reacting to what just happened, with one short line. The line is read out politely by screen readers. */
export function Bostie({ mood, say, size = 60, className }: { mood: Mood; say?: string; size?: number; className?: string }) {
  const still = useReducedMotion();
  const move = MOVES[mood];
  return (
    <div className={cx("flex items-center gap-2.5", className)} data-testid="bostie" data-mood={mood}>
      <motion.img
        key={`${mood}-${say}`}
        src="/mascot-face.png"
        alt=""
        width={size}
        height={size}
        draggable={false}
        className="shrink-0 select-none"
        style={{ width: size, height: size }}
        animate={still ? undefined : move.animate}
        transition={{ duration: move.duration, repeat: move.repeat, ease: "easeInOut" }}
      />
      {say && (
        <p aria-live="polite" className="relative min-w-0 rounded-2xl rounded-bl-md bg-card px-3.5 py-2 text-[14.5px] font-semibold leading-snug shadow-card">
          {say}
        </p>
      )}
    </div>
  );
}

export function SoundToggle({ className }: { className?: string }) {
  const sound = useStore((s) => s.sound);
  const setSound = useStore((s) => s.setSound);
  return (
    <button
      aria-label={sound ? "Turn sound off" : "Turn sound on"}
      aria-pressed={sound}
      onClick={() => {
        setSound(!sound);
        if (!sound) setTimeout(() => sfx("tap"), 0);
      }}
      className={cx("grid size-10 shrink-0 place-items-center rounded-full bg-sand text-ink-soft", className)}
    >
      {sound ? <Volume2 size={19} /> : <VolumeX size={19} />}
    </button>
  );
}

/** Exit on the left, what game and how far along in the middle, sound on the right. */
export function GameHeader({ title, progress, onExit, exitLabel = "Games" }: { title: string; progress?: ReactNode; onExit?: () => void; exitLabel?: string }) {
  const exit = "flex h-10 shrink-0 items-center gap-0.5 pr-2 text-[15px] font-semibold text-forest";
  return (
    <header className="flex items-center gap-2 px-3 pt-2">
      {onExit ? (
        <button onClick={onExit} className={exit}><ChevronLeft size={20} aria-hidden /> {exitLabel}</button>
      ) : (
        <Link href="/play" className={exit}><ChevronLeft size={20} aria-hidden /> {exitLabel}</Link>
      )}
      <p className="min-w-0 flex-1 truncate text-center text-[15px] font-bold">{title}</p>
      {progress && <span className="shrink-0 rounded-full bg-moss px-2.5 py-1 text-[12.5px] font-bold text-forest-deep">{progress}</span>}
      <SoundToggle />
    </header>
  );
}

/** "Earns XP" or "no XP: daily limit reached", so a free play is never a surprise. */
export function XpNote({ left }: { left: number }) {
  return (
    <p className="text-[13px] text-ink-soft" data-testid="xp-note">
      {left > 0 ? `Earns XP: ${left} paid play${left === 1 ? "" : "s"} left today.` : "No XP: daily limit reached. You can still play for fun."}
    </p>
  );
}
