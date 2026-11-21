"use client";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { useStore, type AiEvent } from "@/lib/store";
import { Sheet } from "../Sheet";
import { clockTime, cx } from "../ui";

function EventCard({ e, dark }: { e: AiEvent; dark?: boolean }) {
  const [open, setOpen] = useState(false);
  const rows: [string, string][] = [
    ["Model", e.meta.model],
    ["Input", e.meta.modality],
    ["Latency", `${(e.meta.latencyMs / 1000).toFixed(2)} s`],
  ];
  return (
    <li className={cx("rounded-2xl p-3.5 text-[13px]", dark ? "bg-white/[0.06]" : "border border-line bg-paper")}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[14px] font-bold">{e.meta.feature}</p>
        <time className={dark ? "text-white/50" : "text-ink-faint"}>{clockTime(e.at)}</time>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className={dark ? "text-white/50" : "text-ink-faint"}>{k}</dt>
            <dd className="font-semibold">{v}</dd>
          </div>
        ))}
        <dt className={dark ? "text-white/50" : "text-ink-faint"}>Grounding</dt>
        <dd>
          <ul className="list-disc pl-4">
            {e.meta.grounding.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </dd>
        <dt className={dark ? "text-white/50" : "text-ink-faint"}>Action</dt>
        <dd className={cx("font-semibold", dark ? "text-gold-soft" : "text-forest")}>{e.action}</dd>
      </dl>
      <button onClick={() => setOpen(!open)} aria-expanded={open} className={cx("mt-2 font-semibold underline underline-offset-2", dark ? "text-white/80" : "text-forest")}>
        {open ? "Hide structured output" : "Show structured output"}
      </button>
      {open && (
        <pre className={cx("mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-xl p-2.5 text-[11.5px] leading-snug", dark ? "bg-black/40" : "bg-ink text-paper")}>
          {JSON.stringify(e.output, null, 2)}
        </pre>
      )}
    </li>
  );
}

/** Log of the real Gemini calls this session made: no key, no photo, no hidden reasoning. */
export function ShowcaseLog({ dark }: { dark?: boolean }) {
  const ai = useStore((s) => s.ai);
  if (!ai.length)
    return (
      <p className={cx("rounded-2xl p-4 text-[14px]", dark ? "bg-white/[0.06] text-white/70" : "bg-paper text-ink-soft")}>
        Nothing yet. Scan a landmark or type a guess in Guess Boston, and each Gemini request appears here with its
        model, grounding, validated output and latency.
      </p>
    );
  return (
    <ul className="space-y-2.5">
      {ai.map((e) => (
        <EventCard key={e.id} e={e} dark={dark} />
      ))}
    </ul>
  );
}

export function ShowcaseSheet() {
  const open = useStore((s) => s.showcase);
  const setShowcase = useStore((s) => s.setShowcase);
  return (
    <Sheet open={open} onClose={() => setShowcase(false)} title="Gemini activity" tall>
      <ShowcaseLog />
    </Sheet>
  );
}

export function GeminiChip({ className }: { className?: string }) {
  const count = useStore((s) => s.ai.length);
  const setShowcase = useStore((s) => s.setShowcase);
  return (
    <button
      onClick={() => setShowcase(true)}
      className={cx("inline-flex h-8 items-center gap-1.5 rounded-full bg-ink px-3 text-[12.5px] font-semibold text-paper", className)}
    >
      <Sparkles size={14} aria-hidden /> Gemini activity{count ? ` (${count})` : ""}
    </button>
  );
}
