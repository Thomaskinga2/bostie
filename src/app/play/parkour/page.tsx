"use client";
// Bostie Parkour: Bostie runs through a little 3D Boston. Each obstacle asks one question;
// answer within six seconds and he clears it, otherwise the run ends.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bostie, GameHeader, XpNote, type Mood } from "@/components/games/GameChrome";
import type { Run } from "@/components/games/parkourScene";
import { Button, cx, Photo } from "@/components/ui";
import { paidPlaysLeft, PARKOUR_LEVELS, PARKOUR_SECONDS, parkourQuestions, playEvent, type Question } from "@/lib/game";
import { playXp } from "@/lib/gamification";
import { useNow } from "@/lib/api";
import { sfx } from "@/lib/sound";
import { useStore } from "@/lib/store";

type End = { won: boolean; cleared: number; seconds: number; xp: number };

function RunView({ level, low, onEnd, onQuit }: { level: number; low: boolean; onEnd: (e: Omit<End, "xp">) => void; onQuit: () => void }) {
  const total = PARKOUR_LEVELS[level].obstacles;
  const canvas = useRef<HTMLCanvasElement>(null);
  const run = useRef<Run | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  const clock = useRef<HTMLSpanElement>(null);
  const [questions] = useState<Question[]>(() => parkourQuestions(total));
  const [asking, setAsking] = useState<number | null>(null);
  const [cleared, setCleared] = useState(0);
  const [bostie, setBostie] = useState<{ mood: Mood; say: string }>({ mood: "welcome", say: "Here we go! Keep me on my paws." });
  const [broken, setBroken] = useState(false);
  const onEndRef = useRef(onEnd);
  useEffect(() => {
    onEndRef.current = onEnd;
  });

  useEffect(() => {
    let alive = true;
    let lastSecond = PARKOUR_SECONDS;
    const started = Date.now();
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    import("@/components/games/parkourScene")
      .then(({ startRun }) => {
        if (!alive || !canvas.current) return;
        run.current = startRun(canvas.current, {
          obstacles: total, low, still,
          onAsk: (i) => {
            lastSecond = PARKOUR_SECONDS;
            setAsking(i);
            setBostie({ mood: "hurry", say: "Quick! Help me dodge!" });
          },
          onTick: (left) => {
            if (bar.current) bar.current.style.width = `${(left / PARKOUR_SECONDS) * 100}%`;
            if (clock.current) clock.current.textContent = String(Math.ceil(left));
            const s = Math.ceil(left);
            if (s < lastSecond && s <= 3 && s > 0) sfx("tick");
            lastSecond = s;
          },
          onTimeout: () => {
            setAsking(null);
            setBostie({ mood: "oops", say: "Too slow! Look out…" });
            sfx("wrong");
          },
          onCleared: (n) => {
            setCleared(n);
            setBostie(n >= total ? { mood: "win", say: "We made it!" } : { mood: "cheer", say: "Nice! Keep going!" });
          },
          onEnd: (won, n) => onEndRef.current({ won, cleared: n, seconds: Math.round((Date.now() - started) / 1000) }),
        });
      })
      .catch(() => alive && setBroken(true)); // no WebGL on this device
    return () => {
      alive = false;
      run.current?.dispose();
      run.current = null;
    };
  }, [total, low]);

  const q = asking !== null ? questions[asking] : null;
  const answer = (name: string) => {
    if (!q || !run.current) return;
    const correct = name === q.answer;
    run.current.answer(correct);
    setAsking(null); // the buttons go at once, so a second tap cannot land
    setBostie(correct ? { mood: "cheer", say: "You got it! Let's go!" } : { mood: "oops", say: "Oops! That's not it…" });
    sfx(correct ? "jump" : "wrong");
  };

  if (broken)
    return (
      <div className="flex h-full flex-col">
        <GameHeader title="Bostie Parkour" />
        <div className="grid flex-1 place-items-center px-8 text-center">
          <div>
            <Bostie mood="lose" size={72} className="justify-center" />
            <h1 className="mt-3 text-[24px] font-bold">This device cannot show 3D</h1>
            <p className="mt-1.5 text-[15px] text-ink-soft">Bostie Parkour needs 3D graphics, which this browser has turned off. The other two games work everywhere.</p>
            <Link href="/play" className="mt-4 inline-flex h-11 items-center rounded-full bg-forest px-6 text-[15px] font-bold text-paper">Back to games</Link>
          </div>
        </div>
      </div>
    );

  return (
    <div className="flex h-full flex-col" data-testid="parkour-run" data-asking={asking ?? ""}>
      <GameHeader title="Bostie Parkour" progress={`${Math.min(cleared + 1, total)} of ${total}`} onExit={onQuit} exitLabel="Quit" />
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <canvas ref={canvas} className="absolute inset-0 size-full" aria-label="Bostie running through Boston" />
        <div className="absolute inset-x-3 top-2">
          <Bostie mood={bostie.mood} say={bostie.say} size={46} />
          <div className="mt-2 flex gap-1" aria-label={`${cleared} of ${total} obstacles cleared`} role="img">
            {Array.from({ length: total }, (_, n) => <span key={n} className={cx("h-2 flex-1 rounded-full", n < cleared ? "bg-forest" : "bg-white/70")} />)}
          </div>
        </div>
      </div>
      {/* The question has its own space under the run, so it never covers Bostie. */}
      <div className="shrink-0 border-t border-line bg-card px-4 pb-3 pt-3" style={{ minHeight: 268 }}>
        {q ? (
          <div role="group" aria-label="Question" data-qid={q.id}>
            <div className="flex items-center gap-3">
              <span ref={clock} aria-label="Seconds left" data-testid="parkour-clock" className="grid size-12 shrink-0 place-items-center rounded-full bg-t-red font-display text-[26px] font-bold leading-none text-white">{PARKOUR_SECONDS}</span>
              <div className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-sand"><div ref={bar} className="h-full rounded-full bg-t-red" style={{ width: "100%" }} /></div>
            </div>
            <div className="mt-2.5 flex items-center gap-3">
              {q.photo && <Photo id={q.photo} credit={false} className="size-[64px] shrink-0 rounded-2xl" alt="Mystery place" />}
              <p className="min-w-0 text-[16px] font-bold leading-snug">{q.prompt}</p>
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              {q.options.map((name) => (
                <button key={name} onClick={() => answer(name)} className="min-h-[54px] rounded-2xl border border-line bg-paper px-2.5 py-2 text-[15px] font-bold leading-tight active:bg-moss">
                  {name}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="grid h-[240px] place-items-center text-center text-[15px] text-ink-soft">
            {cleared >= total ? "Every obstacle cleared!" : "Bostie is running. A question appears as each obstacle gets close."}
          </p>
        )}
      </div>
    </div>
  );
}

export default function ParkourPage() {
  const events = useStore((s) => s.events);
  const reward = useStore((s) => s.reward);
  const now = useNow(60_000);
  const [level, setLevel] = useState(0);
  const [low, setLow] = useState(false);
  const [running, setRunning] = useState(0); // a new number restarts the run
  const [end, setEnd] = useState<End | null>(null);

  const finish = (e: Omit<End, "xp">) => {
    const event = playEvent(useStore.getState().events, { game: "parkour", score: e.cleared, won: e.won, hints: 0, level }, Date.now());
    reward(event);
    sfx(e.won ? "win" : "lose");
    setEnd({ ...e, xp: playXp(event) });
    setRunning(0);
  };
  const start = () => {
    setEnd(null);
    setRunning((n) => n + 1 || 1);
    sfx("tap");
  };

  if (running) return <RunView key={running} level={level} low={low} onEnd={finish} onQuit={() => setRunning(0)} />;

  const total = PARKOUR_LEVELS[level].obstacles;
  return (
    <div data-scene="play-parkour" className="scroll-area flex h-full flex-col pb-6">
      <GameHeader title="Bostie Parkour" />
      <div className="flex-1 px-5 pt-3">
        {end ? (
          <div data-testid="parkour-end" data-won={end.won}>
            <Bostie mood={end.won ? "win" : "lose"} say={end.won ? "We made it! What a run!" : "Ouch! I saw stars. One more go?"} size={76} />
            <h1 className="mt-3 text-[30px] font-bold leading-tight">{end.won ? "Run complete" : "Knocked out"}</h1>
            <dl className="mt-3 grid grid-cols-3 divide-x divide-line rounded-2xl border border-line bg-card py-3.5 text-center">
              {[[`${end.cleared}/${total}`, "obstacles"], [`${end.seconds}s`, "time"], [`+${end.xp}`, end.xp === 0 ? "XP: daily limit" : "XP"]].map(([n, label]) => (
                <div key={label}>
                  <dd className="font-display text-[26px] font-bold leading-none text-forest">{n}</dd>
                  <dt className="mt-1 text-[12px] text-ink-soft">{label}</dt>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-[13.5px] text-ink-soft">{PARKOUR_LEVELS[level].name} difficulty. Pick a level below to go again.</p>
          </div>
        ) : (
          <>
            <Bostie mood="welcome" say="I run, you think. Deal?" size={76} />
            <h1 className="mt-4 text-[28px] font-bold leading-tight">How to play</h1>
            <ol className="mt-2 space-y-2 text-[15.5px] leading-snug">
              <li><strong>Bostie runs by himself.</strong> You never steer.</li>
              <li><strong>Each obstacle asks a question</strong> about Boston. You have {PARKOUR_SECONDS} seconds.</li>
              <li><strong>Right:</strong> he jumps or swerves and keeps going.</li>
              <li><strong>Wrong or too slow:</strong> he crashes and the run ends.</li>
            </ol>
          </>
        )}

        <h2 className="mt-5 text-[20px] font-bold">Difficulty</h2>
        <div data-tour="parkour-levels" role="radiogroup" aria-label="Difficulty" className="mt-2 grid grid-cols-2 gap-2">
          {PARKOUR_LEVELS.map((l, n) => (
            <button key={l.name} role="radio" aria-checked={level === n} onClick={() => setLevel(n)} className={cx("rounded-2xl border bg-card px-3 py-2.5 text-left", level === n ? "border-forest shadow-card ring-1 ring-forest" : "border-line")}>
              <span className="block text-[16px] font-bold">{l.name}</span>
              <span className="block text-[13.5px] text-ink-soft">{l.obstacles} obstacles</span>
            </button>
          ))}
        </div>
        <label className="mt-3 flex items-center gap-2.5 text-[14.5px]">
          <input type="checkbox" checked={low} onChange={(e) => setLow(e.target.checked)} className="size-5 accent-forest" />
          Low graphics (for older phones)
        </label>
      </div>
      <div className="space-y-2 px-5 pt-3">
        <XpNote left={paidPlaysLeft(events, "parkour", now)} />
        <Button size="lg" className="w-full" onClick={start}>{end ? "Run again" : "Start run"}</Button>
        {end && <Link href="/play" className="flex h-11 items-center justify-center text-[15px] font-semibold text-forest">Back to games</Link>}
      </div>
    </div>
  );
}
