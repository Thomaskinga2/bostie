"use client";
// Bostie Drawing: draw a Boston landmark or symbol, then Gemini says how recognizable it is.
// The drawing lives in memory only: it is never saved on the device or the server.
import { Eraser, Pencil, Redo2, Trash2, Undo2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bostie, GameHeader, XpNote } from "@/components/games/GameChrome";
import { Button, cx } from "@/components/ui";
import { ZoomImage, ZoomPhoto } from "@/components/Lightbox";
import { ApiError, post, useNow } from "@/lib/api";
import type { DrawResponse } from "@/lib/contracts";
import { nextSubject, paidPlaysLeft, playEvent, type Subject } from "@/lib/game";
import { playXp } from "@/lib/gamification";
import { sfx } from "@/lib/sound";
import { useStore } from "@/lib/store";

const SIZE = 512; // canvas pixels, whatever its size on screen
const COLORS = ["#1d2320", "#da291c", "#ed8b00", "#e2a11b", "#00843d", "#003da5", "#7c4a2d", "#d4537e"];
type Stroke = { color: string; width: number; erase: boolean; points: [number, number][] };

function paint(canvas: HTMLCanvasElement, strokes: Stroke[]) {
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, SIZE, SIZE);
  g.lineCap = "round";
  g.lineJoin = "round";
  for (const s of strokes) {
    g.strokeStyle = s.erase ? "#ffffff" : s.color;
    g.fillStyle = g.strokeStyle;
    g.lineWidth = s.width;
    g.beginPath();
    if (s.points.length === 1) {
      g.arc(s.points[0][0], s.points[0][1], s.width / 2, 0, Math.PI * 2);
      g.fill();
      continue;
    }
    s.points.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
  }
}

/** True when there is something to judge: at least one real mark that has not been erased or cleared. */
const hasInk = (strokes: Stroke[]) => strokes.some((s) => !s.erase && s.points.length > 0);

export default function DrawPage() {
  const events = useStore((s) => s.events);
  const reward = useStore((s) => s.reward);
  const now = useNow(60_000);
  const logAi = useStore((s) => s.logAi);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [seen, setSeen] = useState<string[]>([]);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [undone, setUndone] = useState<Stroke[]>([]);
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(8);
  const [erase, setErase] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ res: DrawResponse; picture: string; xp: number } | null>(null);
  const [shown, setShown] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef<Stroke | null>(null);

  useEffect(() => {
    if (canvas.current) paint(canvas.current, strokes);
  }, [strokes, subject, result]);

  // The score counts up, so the reveal has a moment of suspense.
  useEffect(() => {
    if (!result) return;
    const target = result.res.score;
    const started = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / 900);
      setShown(Math.round(target * (1 - (1 - t) ** 3)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [result]);

  const begin = (s: Subject) => {
    setSubject(s);
    setSeen((x) => [...x, s.id].slice(-8));
    setStrokes([]);
    setUndone([]);
    setResult(null);
    setError("");
  };

  const at = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * SIZE, ((e.clientY - r.top) / r.height) * SIZE];
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    live.current = { color, width, erase, points: [at(e)] };
    paint(e.currentTarget, [...strokes, live.current]);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!live.current) return;
    live.current.points.push(at(e));
    paint(e.currentTarget, [...strokes, live.current]);
  };
  const up = useCallback(() => {
    if (!live.current) return;
    const done = live.current;
    live.current = null;
    setStrokes((s) => [...s, done]);
    setUndone([]);
    setError("");
  }, []);

  const undo = () => {
    if (!strokes.length) return;
    setUndone([strokes[strokes.length - 1], ...undone]);
    setStrokes(strokes.slice(0, -1));
  };
  const redo = () => {
    if (!undone.length) return;
    setStrokes([...strokes, undone[0]]);
    setUndone(undone.slice(1));
  };

  const submit = async () => {
    if (!subject || !canvas.current || busy) return;
    if (!hasInk(strokes)) return setError("Draw something first. Bostie cannot judge an empty canvas.");
    setBusy(true);
    setError("");
    const picture = canvas.current.toDataURL("image/jpeg", 0.85);
    try {
      const raw = await post<DrawResponse>("/api/game/draw", { subjectId: subject.id, image: picture.split(",")[1] });
      // The server clamps the score too; never let an out-of-range number reach XP or the screen.
      const res = { ...raw, score: Math.round(Math.min(100, Math.max(0, Number(raw.score) || 0))) };
      if (res.meta) logAi(res.meta, { score: res.score, recognizableFeatures: res.recognizableFeatures, missingFeatures: res.missingFeatures }, `Score clamped to ${res.score}; XP set by the score band, not by the model`);
      const event = playEvent(events, { game: "draw", score: res.score, won: res.score >= 50, hints: 0 }, Date.now());
      reward(event);
      setShown(0);
      setResult({ res, picture, xp: playXp(event) });
      sfx(res.score >= 50 ? "win" : "lose");
    } catch (e) {
      setError(e instanceof ApiError && e.message ? e.message : "Bostie could not look at your drawing just now. It is still here: try again.");
    } finally {
      setBusy(false);
    }
  };

  // ---- instructions -----------------------------------------------------------
  if (!subject) {
    return (
      <div data-scene="play-draw" className="scroll-area flex h-full flex-col pb-6">
        <GameHeader title="Bostie Drawing" />
        <div className="flex-1 px-5 pt-3">
          <Bostie mood="welcome" say="Grab a pen! I love a good doodle." size={76} />
          <h1 className="mt-4 text-[28px] font-bold leading-tight">How to play</h1>
          <ol className="mt-2 space-y-2 text-[15.5px] leading-snug">
            <li><strong>Bostie names something</strong> from Boston: a landmark or a symbol like a swan boat.</li>
            <li><strong>You draw it</strong> with your finger, a stylus or a mouse. A photo stays on screen to copy from.</li>
            <li><strong>Gemini looks at it</strong> and says how recognizable it is, from 0 to 100.</li>
            <li>It is about <strong>being recognizable</strong>, not about being a good artist.</li>
          </ol>
          <p className="mt-3 rounded-2xl bg-sand px-4 py-3 text-[13.5px] leading-snug text-ink-soft">
            Your drawing is sent to Google Gemini to be judged and is not saved anywhere.
          </p>
        </div>
        <div className="space-y-2 px-5">
          <XpNote left={paidPlaysLeft(events, "draw", now)} />
          <Button size="lg" className="w-full" onClick={() => begin(nextSubject(seen))} data-tour="draw-start">Start drawing</Button>
        </div>
      </div>
    );
  }

  // ---- result -------------------------------------------------------------------
  if (result) {
    const { res, picture, xp } = result;
    const good = res.score >= 50;
    return (
      <div data-scene="play-draw-result" className="scroll-area h-full pb-8" data-testid="draw-result">
        <GameHeader title="Bostie Drawing" progress="Result" />
        <div className="px-5 pt-3">
          <Bostie mood={good ? "win" : res.score > 0 ? "cheer" : "oops"} say={good ? "Whoa, that's your masterpiece!" : res.score > 0 ? "I can see where you were going!" : "Hmm, I could not make that one out."} size={70} />
          <div data-tour="draw-score" className="mt-3 flex items-end gap-5 border-y border-line py-3.5">
            <div>
              <p className="font-display text-[52px] font-bold leading-none text-forest" data-testid="draw-score">{shown}%</p>
              <p className="mt-1 text-[12.5px] text-ink-soft">recognizable, in Bostie&apos;s opinion</p>
            </div>
            <div>
              <p className="font-display text-[26px] font-bold leading-none text-gold">+{xp}</p>
              <p className="mt-1 text-[12.5px] text-ink-soft">{xp === 0 && res.score > 0 ? "XP: daily limit reached" : "XP"}</p>
            </div>
          </div>
          <p className="mt-3 text-[16px] leading-snug">{res.feedback}</p>

          <div data-tour="draw-compare" className="mt-4 grid grid-cols-2 gap-3">
            <figure>
              <ZoomImage src={picture} alt={`Your drawing of ${subject.name}`} className="aspect-square w-full rounded-2xl border border-line bg-white" />
              <figcaption className="mt-1 text-center text-[12.5px] text-ink-soft">Your drawing</figcaption>
            </figure>
            <figure>
              {subject.photo ? (
                <ZoomPhoto id={subject.photo} className="aspect-square w-full rounded-2xl" alt={subject.name} />
              ) : (
                <div className="grid aspect-square w-full place-items-center rounded-2xl border border-dashed border-line px-3 text-center text-[13px] text-ink-soft">No reference photo for this one.</div>
              )}
              <figcaption className="mt-1 text-center text-[12.5px] text-ink-soft">{subject.name}</figcaption>
            </figure>
          </div>

          {(res.recognizableFeatures.length > 0 || res.missingFeatures.length > 0) && (
            <div className="mt-4 grid gap-3 text-[14.5px]">
              {res.recognizableFeatures.length > 0 && <p><strong>Bostie spotted:</strong> {res.recognizableFeatures.join(", ")}.</p>}
              {res.missingFeatures.length > 0 && <p><strong>Could add:</strong> {res.missingFeatures.join(", ")}.</p>}
            </div>
          )}
          <p className="mt-3 text-[12.5px] text-ink-faint">The score is Gemini&apos;s opinion for fun, not a measurement. XP is set by the score band.</p>

          <div className="mt-5 space-y-2">
            <Button size="lg" className="w-full" onClick={() => begin(nextSubject(seen))}>Next drawing</Button>
            <Button variant="secondary" className="w-full" onClick={() => begin(subject)}>Try this one again</Button>
            <Link href="/play" className="flex h-11 items-center justify-center text-[15px] font-semibold text-forest">Back to games</Link>
          </div>
        </div>
      </div>
    );
  }

  // ---- canvas -------------------------------------------------------------------
  const tool = "grid size-11 shrink-0 place-items-center rounded-full border border-line bg-card text-ink disabled:opacity-35";
  return (
    <div data-scene="play-draw-canvas" className="flex h-full flex-col">
      <GameHeader title="Bostie Drawing" onExit={() => setSubject(null)} exitLabel="Quit" />
      <div className="scroll-area min-h-0 flex-1 px-4 pb-3 pt-1">
        <Bostie mood={busy ? "thinking" : "welcome"} say={busy ? "Let me have a good look…" : `Draw: ${subject.name}`} size={50} />
        <h1 className="sr-only">Draw {subject.name}</h1>
        {/* Something to look at while drawing: the photo, or for symbols the things to include. */}
        <div data-tour="draw-reference">
        {subject.photo ? (
          <ZoomPhoto id={subject.photo} className="mt-2 h-[116px] rounded-2xl" alt={`Reference photo: ${subject.name}`} />
        ) : (
          <p className="mt-2 rounded-2xl bg-sand px-3.5 py-2.5 text-[13.5px] leading-snug text-ink-soft" data-testid="draw-cues">
            <strong className="text-ink">No photo for this one. Try to include:</strong> {subject.cues.join(", ")}.
          </p>
        )}
        </div>
        <canvas
          ref={canvas}
          width={SIZE}
          height={SIZE}
          data-tour="draw-canvas"
          aria-label={`Drawing canvas: ${subject.name}`}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          className="mt-2 aspect-square w-full touch-none rounded-3xl border-2 border-line bg-white shadow-card"
          style={{ cursor: "crosshair" }}
        />
        <div data-tour="draw-tools">
        <div role="radiogroup" aria-label="Colour" className="mt-3 flex flex-wrap items-center justify-between gap-1.5">
          {COLORS.map((c) => (
            <button key={c} role="radio" aria-checked={!erase && color === c} aria-label={`Colour ${c}`} onClick={() => (setColor(c), setErase(false))} className={cx("size-9 rounded-full border-2", !erase && color === c ? "border-ink ring-2 ring-gold" : "border-white")} style={{ background: c }} />
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button onClick={() => setErase(false)} aria-pressed={!erase} aria-label="Pen" className={cx(tool, !erase && "border-forest bg-moss")}><Pencil size={19} /></button>
          <button onClick={() => setErase(true)} aria-pressed={erase} aria-label="Eraser" className={cx(tool, erase && "border-forest bg-moss")}><Eraser size={19} /></button>
          <label className="flex min-w-0 flex-1 items-center gap-2 px-1 text-[13px] font-semibold text-ink-soft">
            Size
            <input type="range" min={2} max={30} step={1} value={width} onChange={(e) => setWidth(Number(e.target.value))} aria-label="Brush size" className="min-w-0 flex-1 accent-forest" />
          </label>
          <button onClick={undo} disabled={!strokes.length} aria-label="Undo" className={tool}><Undo2 size={19} /></button>
          <button onClick={redo} disabled={!undone.length} aria-label="Redo" className={tool}><Redo2 size={19} /></button>
          <button onClick={() => (setUndone([]), setStrokes([]))} disabled={!strokes.length} aria-label="Clear canvas" className={tool}><Trash2 size={19} /></button>
        </div>
        </div>
      </div>
      <div data-tour="draw-submit" className="shrink-0 border-t border-line bg-card px-4 pb-3 pt-3">
        {error && <p role="alert" className="mb-2 text-[13.5px] font-semibold text-t-red">{error}</p>}
        <Button size="lg" className="w-full" onClick={submit} disabled={busy}>{busy ? "Bostie is looking…" : error && hasInk(strokes) ? "Try again" : "Submit drawing"}</Button>
      </div>
    </div>
  );
}
