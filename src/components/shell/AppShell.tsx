"use client";
import { BatteryFull, Maximize2, Minimize2, Play, RotateCcw, Signal, Sparkles, Wifi } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useStore } from "@/lib/store";
import { useSupabaseSync } from "@/lib/sync";
import { Celebrations } from "./Celebrations";
import { DemoChecklist, DemoStrip } from "./DemoGuide";
import { GuideButton, Tour } from "./Tour";
import { ShowcaseLog, ShowcaseSheet } from "./Showcase";
import { TabBar } from "./TabBar";
import { Logo, Welcome } from "./Welcome";

const noop = () => () => {};
/** False during server render and hydration, true once mounted in the browser. */
export const useMounted = () => useSyncExternalStore(noop, () => true, () => false);

const everyTwentySeconds = (cb: () => void) => {
  const t = setInterval(cb, 20_000);
  return () => clearInterval(t);
};
const wallClock = () => new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(/\s?[AP]M/i, "");

function StatusBar() {
  const time = useSyncExternalStore(everyTwentySeconds, wallClock, () => "");
  return (
    <>
      {/* Real phones: just respect the notch. */}
      <div className="h-[env(safe-area-inset-top)] shrink-0 bg-paper framed:hidden" />
      {/* Desktop frame: simulated iOS status bar with a Dynamic Island. */}
      <div aria-hidden className="relative hidden h-[50px] shrink-0 items-center justify-between bg-paper px-8 pt-2 text-[15px] font-semibold framed:flex">
        <span className="w-14">{time}</span>
        <span className="absolute left-1/2 top-[11px] h-[30px] w-[108px] -translate-x-1/2 rounded-full bg-black" />
        <span className="flex w-14 items-center justify-end gap-1.5">
          <Signal size={15} strokeWidth={2.6} />
          <Wifi size={15} strokeWidth={2.6} />
          <BatteryFull size={21} strokeWidth={2} />
        </span>
      </div>
    </>
  );
}

/** Judge walkthrough. Demo Mode only. */
function DeskLeft() {
  const resetAll = useStore((s) => s.resetAll);
  const replayIntro = useStore((s) => s.replayIntro);
  const router = useRouter();
  return (
    <aside className="hidden w-[300px] shrink-0 flex-col self-stretch py-10 text-white framed:min-[1160px]:flex">
      <div className="flex items-center gap-3">
        <Logo size={44} />
        <div>
          <p className="font-display text-[26px] font-bold leading-none">TQuest</p>
          <p className="mt-1 text-[14px] text-white/60">Make every ride an adventure.</p>
        </div>
      </div>
      <h2 className="mt-8 text-[19px] font-bold">Judge walkthrough</h2>
      <div className="-mx-3 mt-3">
        <DemoChecklist />
      </div>
      <div className="mt-auto space-y-2 pt-6">
        <GuideButton
          label="Replay tips for this screen"
          className="h-11 w-full justify-center rounded-full bg-white/10 text-[14px] text-white hover:bg-white/15"
        />
        <button
          onClick={() => {
            replayIntro();
            router.push("/");
          }}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-white/10 text-[14px] font-semibold text-white hover:bg-white/15"
        >
          <Play size={15} aria-hidden /> Replay intro
        </button>
        <button
          onClick={() => {
            resetAll();
            router.push("/");
          }}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-full border border-white/25 text-[14px] font-semibold text-white/90 hover:bg-white/5"
        >
          <RotateCcw size={15} aria-hidden /> Reset demo progress
        </button>
        <p className="text-center text-[12px] text-white/45">Transit in demo mode is simulated and labelled. Gemini calls are live.</p>
      </div>
    </aside>
  );
}

/** Live log of Gemini calls. Demo Mode only. */
function DeskRight() {
  return (
    <aside className="hidden w-[330px] shrink-0 flex-col self-stretch py-10 text-white framed:min-[1160px]:flex">
      <h2 className="flex items-center gap-2 text-[19px] font-bold">
        <Sparkles size={18} className="text-gold" aria-hidden /> Gemini, live
      </h2>
      <p className="mt-1 text-[13.5px] leading-relaxed text-white/60">
        Every model call this session, with what it was given and what validated code did with the answer.
      </p>
      <div className="scroll-area mt-4 min-h-0 flex-1">
        <ShowcaseLog dark />
      </div>
    </aside>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  // Persisted state lives in localStorage, so app content renders only after mount.
  const ready = useMounted();
  const [full, setFull] = useState(false);
  const onboarded = useStore((s) => s.onboarded);
  const demo = useStore((s) => s.demo);
  const setDemo = useStore((s) => s.setDemo);
  // Regular visitors get the app on its own. The walkthrough and API log belong to Demo Mode.
  const judging = ready && onboarded && demo;
  useSupabaseSync(); // no-op unless Supabase env vars are set
  useEffect(() => {
    if (full) document.documentElement.dataset.full = "1";
    else delete document.documentElement.dataset.full;
  }, [full]);

  return (
    <div className="flex h-dvh justify-center framed:items-center framed:gap-12 framed:px-8">
      {judging && <DeskLeft />}
      <div className="relative h-full w-full max-w-[560px] framed:h-[min(868px,calc(100dvh-36px))] framed:w-[402px] framed:shrink-0 framed:rounded-[58px] framed:bg-[#0b0e0c] framed:p-[11px] framed:shadow-[0_0_0_2px_#2c3530,0_40px_90px_-30px_rgb(0_0_0/0.8)]">
        {/* side buttons, purely decorative */}
        <span aria-hidden className="absolute -left-[3px] top-[150px] hidden h-9 w-[3px] rounded-l bg-[#2c3530] framed:block" />
        <span aria-hidden className="absolute -left-[3px] top-[210px] hidden h-16 w-[3px] rounded-l bg-[#2c3530] framed:block" />
        <span aria-hidden className="absolute -right-[3px] top-[230px] hidden h-24 w-[3px] rounded-r bg-[#2c3530] framed:block" />

        <div id="screen" className="relative flex h-full flex-col overflow-hidden bg-paper framed:rounded-[47px]">
          <StatusBar />
          {ready && onboarded && <DemoStrip />}
          <main className="relative min-h-0 flex-1">
            {!ready ? (
              <div className="grid h-full place-items-center">
                <Logo size={72} />
              </div>
            ) : onboarded ? (
              children
            ) : (
              <Welcome />
            )}
          </main>
          {ready && onboarded && (
            <TabBar />
          )}
          <div id="overlay-root" className="pointer-events-none absolute inset-0 z-50" />
          {ready && (
            <>
              <ShowcaseSheet />
              {onboarded && <Tour />}
              <Celebrations />
            </>
          )}
        </div>
      </div>
      {judging && <DeskRight />}

      {/* Desktop only: Demo Mode switch, and the device frame / full-window toggle. */}
      <div className="fixed right-4 top-4 z-[60] hidden gap-2 md:flex [@media(hover:none)]:hidden">
        {ready && onboarded && (
          <button
            onClick={() => setDemo(!demo)}
            aria-pressed={demo}
            className={`flex h-10 items-center gap-2 rounded-full px-4 text-[13px] font-semibold ${demo ? "bg-gold text-forest-deep" : "bg-ink/85 text-paper"}`}
          >
            <Sparkles size={15} aria-hidden /> {demo ? "Demo mode on" : "Demo mode"}
          </button>
        )}
        <button onClick={() => setFull(!full)} className="flex h-10 items-center gap-2 rounded-full bg-ink/85 px-4 text-[13px] font-semibold text-paper">
          {full ? <Minimize2 size={15} aria-hidden /> : <Maximize2 size={15} aria-hidden />}
          {full ? "Show phone frame" : "Fullscreen"}
        </button>
      </div>
    </div>
  );
}
