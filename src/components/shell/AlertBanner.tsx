"use client";
// The get-off alert inside the app: shown on whatever screen the rider is on.
import { BellRing, X } from "lucide-react";
import { useEffect } from "react";
import { useStore } from "@/lib/store";

export function AlertBanner() {
  const notice = useStore((s) => s.notice);
  const setNotice = useStore((s) => s.setNotice);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 12_000);
    return () => clearTimeout(t);
  }, [notice, setNotice]);
  if (!notice) return null;
  return (
    <div className="pointer-events-none absolute inset-x-3 top-[calc(env(safe-area-inset-top)+8px)] z-[60] framed:top-[58px]">
      <div role="alert" data-testid="getoff-alert" className="pointer-events-auto flex items-start gap-3 rounded-2xl bg-ink px-4 py-3 text-paper shadow-lift">
        <BellRing size={22} className="mt-0.5 shrink-0 text-gold" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-bold leading-tight">{notice.title}</p>
          <p className="text-[14px] leading-snug text-paper/80">{notice.body}</p>
        </div>
        <button onClick={() => setNotice(null)} aria-label="Dismiss alert" className="grid size-8 shrink-0 place-items-center rounded-full text-paper/80">
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
