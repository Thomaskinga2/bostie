"use client";
import type { ReactNode } from "react";
import { cx } from "@/components/ui";

/** Link styled as a secondary button (ui.Button is a <button>, these navigate). */
export const linkButton =
  "inline-flex h-11 items-center justify-center rounded-full border border-line bg-card px-5 text-[15px] font-semibold text-ink active:scale-[0.97]";

export function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div>
      <h2 className="text-[26px] font-bold leading-tight">{title}</h2>
      {sub && <p className="mt-1 text-[14.5px] text-ink-soft">{sub}</p>}
    </div>
  );
}

export function Chip({
  active, onClick, children, color,
}: { active: boolean; onClick: () => void; children: ReactNode; color?: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13.5px] font-semibold transition",
        active ? "border-ink bg-ink text-paper" : "border-line bg-card text-ink-soft",
      )}
    >
      {color && <span className="size-2.5 rounded-full" style={{ background: color }} />}
      {children}
    </button>
  );
}
