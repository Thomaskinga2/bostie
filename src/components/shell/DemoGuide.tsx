"use client";
import { Check, ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDemoSteps } from "@/lib/demo";
import { useStore } from "@/lib/store";
import { cx } from "../ui";
import { GuideButton } from "./Tour";

/** Desktop side panel: the whole judge walkthrough as a checklist. */
export function DemoChecklist() {
  const { steps, current } = useDemoSteps();
  return (
    <ol className="space-y-1">
      {steps.map((s, i) => {
        const active = s.id === current?.id;
        return (
          <li key={s.id}>
            <Link href={s.href} className={cx("flex gap-3 rounded-2xl px-3 py-2.5 transition", active ? "bg-white/10" : "hover:bg-white/5")}>
              <span
                className={cx(
                  "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-bold",
                  s.done ? "bg-gold text-forest-deep" : active ? "bg-paper text-forest-deep" : "border border-white/30 text-white/60",
                )}
              >
                {s.done ? <Check size={14} strokeWidth={3} aria-label="Done" /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className={cx("block text-[15px] font-semibold leading-snug", s.done ? "text-white/55 line-through decoration-white/30" : "text-white")}>{s.title}</span>
                {active && <span className="mt-0.5 block text-[13px] leading-snug text-white/70">{s.detail}</span>}
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

/** In-phone strip above the tab bar: the next demo step, one tap away. */
export function DemoStrip() {
  const demo = useStore((s) => s.demo);
  const { steps, current } = useDemoSteps();
  const pathname = usePathname();
  if (!demo) return null;
  const n = current ? steps.indexOf(current) + 1 : steps.length;
  const here = current && current.href === pathname;
  return (
    <div data-tour="demo-strip" className="relative z-20 flex shrink-0 items-center gap-2 border-b border-gold/40 bg-gold-soft py-1 pl-4 pr-2 text-[#5b410b]">
      {current ? (
        <Link href={current.href} className="flex min-h-10 min-w-0 flex-1 items-center gap-2.5 py-0.5">
          <span className="shrink-0 rounded-full bg-[#5b410b] px-2 py-0.5 text-[11px] font-bold text-gold-soft">
            Demo {n}/{steps.length}
          </span>
          <span className="line-clamp-2 min-w-0 flex-1 text-[13px] font-semibold leading-tight">{here ? current.detail : current.title}</span>
          {!here && <ChevronRight size={16} className="shrink-0" aria-hidden />}
        </Link>
      ) : (
        <p className="min-w-0 flex-1 py-1 text-[13px] font-semibold leading-tight">Demo complete. Reset it in Passport to run it again.</p>
      )}
      <GuideButton className="h-9 shrink-0 rounded-full border border-[#5b410b]/30 px-2.5 text-[12.5px]" />
    </div>
  );
}
