"use client";
import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import { ACHIEVEMENTS, CHALLENGE, LEVELS, STAMP } from "@/lib/gamification";
import { useStore } from "@/lib/store";
import { Overlay } from "../Sheet";
import { RARITY_INK, RarityPips, rarityLabel, StampArt } from "../Stamp";
import { Button, NamedIcon } from "../ui";

/** The one orchestrated moment in the app: a stamp pressed onto the page. */
export function Celebrations() {
  const current = useStore((s) => s.celebrations[0]);
  const remaining = useStore((s) => s.celebrations.length);
  const dismiss = useStore((s) => s.dismissCelebration);

  useEffect(() => {
    if (current) navigator.vibrate?.(current.kind === "level" ? [30, 50, 30, 50, 60] : [18, 40, 28]);
  }, [current]);

  const stamp = current?.kind === "stamp" ? STAMP[current.ref] : null;
  const achievement = current?.kind === "achievement" ? ACHIEVEMENTS.find((a) => a.id === current.ref) : null;
  const challenge = current?.kind === "challenge" ? CHALLENGE[current.ref] : null;
  const level = current?.kind === "level" ? Number(current.ref) : null;

  return (
    <Overlay>
      <AnimatePresence mode="wait">
        {current && (
          <motion.div
            key={current.id}
            role="dialog"
            aria-modal
            aria-label="Reward unlocked"
            className="pointer-events-auto absolute inset-0 z-10 flex flex-col items-center justify-center bg-forest-deep px-8 text-center text-paper"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
          >
            <div className="relative grid h-[210px] w-full place-items-center">
              <motion.span
                aria-hidden
                className="absolute size-44 rounded-full border-2 border-gold/70"
                initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1.7, opacity: [0, 0.8, 0] }} transition={{ delay: 0.3, duration: 0.7 }}
              />
              <motion.div
                initial={{ scale: 2.3, opacity: 0, rotate: -16 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 420, damping: 19, delay: 0.1 }}
              >
                {stamp && <StampArt stamp={stamp} owned className={stamp.kind === "landmark" ? "w-[150px]" : "w-[170px]"} />}
                {(achievement || challenge) && (
                  <div className="grid size-[150px] place-items-center rounded-full bg-gold text-forest-deep shadow-lift">
                    <NamedIcon name={(achievement ?? challenge)!.icon} size={64} strokeWidth={1.6} />
                  </div>
                )}
                {level && (
                  <div className="grid size-[150px] place-items-center rounded-full border-[6px] border-gold bg-paper font-display text-[76px] font-bold leading-none text-forest">
                    {level}
                  </div>
                )}
              </motion.div>
            </div>

            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.42 }}>
              <p className="text-[14px] font-semibold text-gold-soft">
                {stamp ? (stamp.kind === "station" ? "Station stamp collected" : stamp.kind === "landmark" ? "Landmark stamp unlocked" : "Collection complete") : achievement ? "Achievement earned" : challenge ? "Challenge complete" : "Level up"}
              </p>
              <h2 className="mt-1 text-[30px] font-bold leading-tight">
                {stamp?.name ?? achievement?.name ?? challenge?.title ?? LEVELS[level! - 1]?.title}
              </h2>
              {stamp && (
                <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-paper px-3 py-1.5 text-[13px] font-semibold" style={{ color: RARITY_INK[stamp.rarity] }}>
                  <RarityPips rarity={stamp.rarity} /> {rarityLabel(stamp.rarity)}
                </p>
              )}
              <p className="mx-auto mt-3 max-w-[27ch] text-[15px] text-paper/80">
                {stamp?.rule ?? achievement?.description ?? challenge?.description ?? `You are now level ${level}.`}
              </p>
              {(achievement || challenge) && <p className="mt-2 text-[15px] font-bold text-gold-soft">+{(achievement ?? challenge)!.xp} XP</p>}
            </motion.div>

            <Button variant="gold" size="lg" className="mt-8 w-full" onClick={dismiss} autoFocus>
              {remaining > 1 ? `Next reward (${remaining - 1} more)` : stamp ? "Add to passport" : "Continue"}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </Overlay>
  );
}
