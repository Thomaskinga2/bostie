"use client";
// Bostie Guessing: five photos of Boston, four answers each. Code decides what is right.
import { Check, Lightbulb, MapPin, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Bostie, GameHeader, XpNote, type Mood } from "@/components/games/GameChrome";
import type { MapMarker } from "@/components/map/CityMap";
import { Button, cx, Photo } from "@/components/ui";
import { post, useNow } from "@/lib/api";
import type { HintResponse } from "@/lib/contracts";
import { guessRound, paidPlaysLeft, PIN_CORRECT_KM, playEvent, POINTS, ROUND_LENGTH, scoreMap, type Question } from "@/lib/game";
import { playXp } from "@/lib/gamification";
import { BOSTON, distanceKm, formatDistance, type LatLng } from "@/lib/geo";
import { PLACE } from "@/lib/places";
import { sfx } from "@/lib/sound";
import { useStore } from "@/lib/store";

const CityMap = dynamic(() => import("@/components/map/CityMap").then((m) => m.CityMap), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse bg-sand" />,
});

/** How one question went. `picked` is the chosen name, or null when it was answered with a pin. */
type Answer = { picked: string | null; correct: boolean; points: number; hint: boolean; km?: number };
type Round = { questions: Question[]; answers: Answer[] };
const firstSentence = (s: string) => s.split(/(?<=\.)\s/)[0];

export default function GuessPage() {
  const events = useStore((s) => s.events);
  const reward = useStore((s) => s.reward);
  const now = useNow(60_000);
  const logAi = useStore((s) => s.logAi);
  const [round, setRound] = useState<Round | null>(null);
  /** XP actually paid for the finished round (0 once the daily limit is reached). */
  const [earned, setEarned] = useState<number | null>(null);
  const [hint, setHint] = useState<{ text: string | null; source?: string } | null>(null);
  const [pinning, setPinning] = useState(false);
  const [pin, setPin] = useState<LatLng | null>(null);
  const [lastSeen, setLastSeen] = useState<string[]>([]);

  const [i, setI] = useState(0);
  const q = round?.questions[i];
  const answered = round ? round.answers[i] : undefined;
  const done = !!round && earned !== null;
  const pinMarkers = useMemo<MapMarker[]>(() => (pin ? [{ id: "pin", kind: "pin", label: "Your pin", ...pin }] : []), [pin]);

  const start = () => {
    setRound({ questions: guessRound(lastSeen), answers: [] });
    setI(0);
    setEarned(null);
    setHint(null);
    setPinning(false);
    setPin(null);
    sfx("tap");
  };

  const record = (a: Answer) => {
    if (!round || answered) return; // one try: later taps do nothing
    sfx(a.correct ? "correct" : "wrong");
    setRound({ ...round, answers: [...round.answers.slice(0, i), a] });
    setPinning(false);
  };
  const choose = (name: string) => q && record({ picked: name, correct: name === q.answer, points: name === q.answer ? (hint ? POINTS.withHint : POINTS.correct) : 0, hint: !!hint });
  const lockPin = () => {
    if (!q || !pin) return;
    const km = distanceKm(pin, PLACE[q.id]);
    const s = scoreMap(km);
    record({ picked: null, correct: s.correct, points: hint ? Math.round(s.points / 2) : s.points, hint: !!hint, km });
  };

  const next = () => {
    if (!round) return;
    if (i < round.questions.length - 1) {
      setI(i + 1);
      setHint(null);
      setPin(null);
      return;
    }
    const correct = round.answers.filter((a) => a.correct).length;
    const event = playEvent(events, { game: "guess", score: correct, won: correct >= 3, hints: round.answers.filter((a) => a.hint).length }, Date.now());
    reward(event);
    setEarned(playXp(event));
    setLastSeen(round.questions.map((x) => x.id));
    sfx(correct >= 3 ? "win" : "lose");
  };

  const askHint = async () => {
    if (!q || hint || answered) return;
    setHint({ text: null });
    try {
      const res = await post<HintResponse>("/api/game/hint", { placeId: q.id, previous: [], hints: [] });
      logAi(res.meta, res.output, "Hint passed the answer-leak check and was shown");
      setHint({ text: res.hint, source: res.source });
    } catch {
      setHint({ text: `Look for: ${PLACE[q.id].cues[0]}.`, source: "offline" });
    }
  };
  /** A hint also takes two wrong answers away. */
  const removed = useMemo(() => (q && hint ? q.options.filter((o) => o !== q.answer).slice(0, 2) : []), [q, hint]);

  // Number keys 1 to 4 pick an answer.
  useEffect(() => {
    if (!q || answered || pinning || done) return;
    const onKey = (e: KeyboardEvent) => {
      const name = q.options[Number(e.key) - 1];
      if (name && !removed.includes(name)) choose(name);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // re-bound every render so it always sees the current question

  // ---- instructions -----------------------------------------------------------
  if (!round) {
    return (
      <div data-scene="play-intro" className="scroll-area flex h-full flex-col pb-6">
        <GameHeader title="Bostie Guessing" />
        <div className="flex-1 px-5 pt-3">
          <Photo id="old-state-house" credit={false} className="h-[170px] rounded-3xl" />
          <Bostie mood="welcome" say="I know every corner of this city. Do you?" className="mt-4" />
          <h1 className="mt-4 text-[28px] font-bold leading-tight">How to play</h1>
          <ol className="mt-2 space-y-2 text-[15.5px] leading-snug">
            <li><strong>{ROUND_LENGTH} photos</strong> of Boston: landmarks, T stations and neighborhoods, mixed.</li>
            <li><strong>Four answers</strong> each. You get one try, so pick carefully.</li>
            <li><strong>Hint</strong> takes away two wrong answers and gives a clue, for half the points.</li>
            <li><strong>Pin it instead</strong> lets you answer by tapping the map.</li>
          </ol>
        </div>
        <div className="space-y-2 px-5">
          <XpNote left={paidPlaysLeft(events, "guess", now)} />
          <Button size="lg" className="w-full" onClick={start} data-tour="start-round">Start round</Button>
        </div>
      </div>
    );
  }

  // ---- end of round -----------------------------------------------------------
  if (done) {
    const correct = round.answers.filter((a) => a.correct).length;
    const points = round.answers.reduce((n, a) => n + a.points, 0);
    return (
      <div data-scene="play-result" className="scroll-area h-full pb-8">
        <GameHeader title="Bostie Guessing" progress="Done" />
        <div className="px-5 pt-3">
          <Bostie mood={correct >= 3 ? "win" : "lose"} say={correct === ROUND_LENGTH ? "A perfect round! You are a true Bostonian." : correct >= 3 ? "We made it! Nice round." : "Oops! We'll get the next one."} size={76} />
          <h1 className="mt-3 text-[30px] font-bold leading-tight">{correct} of {ROUND_LENGTH} correct</h1>
          <dl data-tour="round-score" className="mt-3 flex items-end gap-6 border-y border-line py-3.5">
            <div>
              <dd className="font-display text-[40px] font-bold leading-none text-forest">{points}</dd>
              <dt className="mt-1 text-[12.5px] text-ink-soft">points</dt>
            </div>
            <div>
              <dd className="font-display text-[26px] font-bold leading-none text-gold">+{earned}</dd>
              <dt className="mt-1 text-[12.5px] text-ink-soft">XP</dt>
            </div>
            <p className="ml-auto max-w-[17ch] text-right text-[12.5px] leading-snug text-ink-faint">
              {earned === 0 && correct > 0 ? "No XP: daily limit reached." : "5 XP for each correct answer. Scored by rules, not by AI."}
            </p>
          </dl>
          <ul data-tour="round-debrief" className="mt-3 divide-y divide-line" aria-label="Your answers">
            {round.questions.map((x, n) => (
              <li key={x.id} className="flex items-center gap-3 py-2.5">
                <Photo id={x.id} credit={false} className="size-12 shrink-0 rounded-xl" />
                <span className="min-w-0 flex-1 truncate text-[15.5px] font-semibold">{x.answer}</span>
                {round.answers[n].correct ? <Check size={20} className="shrink-0 text-forest" aria-label="Correct" /> : <X size={20} className="shrink-0 text-t-red" aria-label="Wrong" />}
              </li>
            ))}
          </ul>
          <div data-tour="next-round" className="mt-5 space-y-2">
            <Button size="lg" className="w-full" onClick={start}>Play again</Button>
            <Link href="/play" className="flex h-11 items-center justify-center text-[15px] font-semibold text-forest">Back to games</Link>
          </div>
        </div>
      </div>
    );
  }

  // ---- a question ---------------------------------------------------------------
  if (!q) return null;
  const mood: Mood = answered ? (answered.correct ? "cheer" : "oops") : "thinking";
  const say = answered ? (answered.correct ? "You got it! Let's go!" : "Oops! We'll get the next one!") : hint ? "Two down. Which one is left?" : "Hmm, take a good look…";
  const last = i === round.questions.length - 1;
  return (
    <div data-scene="play-round" className="flex h-full flex-col">
      <GameHeader title="Bostie Guessing" progress={`${i + 1} of ${ROUND_LENGTH}`} onExit={() => setRound(null)} exitLabel="Quit" />
      <div className="scroll-area min-h-0 flex-1 px-5 pb-4 pt-2">
        <div data-tour="round-photo">
          <Photo id={q.id} credit={!!answered} className="h-[210px] rounded-3xl" alt={answered ? q.answer : "Mystery place in Boston"} />
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sand" role="progressbar" aria-label="Round progress" aria-valuemin={0} aria-valuemax={ROUND_LENGTH} aria-valuenow={round.answers.length}>
          <div className="h-full rounded-full bg-forest transition-[width] duration-500" style={{ width: `${(round.answers.length / ROUND_LENGTH) * 100}%` }} />
        </div>
        <Bostie mood={mood} say={say} size={52} className="mt-3" />
        <h1 className="mt-3 text-[24px] font-bold">{pinning ? "Where is this?" : q.prompt}</h1>

        {hint && (
          <p className="mt-2 flex gap-2.5 rounded-2xl bg-gold-soft px-3.5 py-2.5 text-[14.5px] leading-snug text-[#523a09]" aria-live="polite">
            <Lightbulb size={17} className="mt-0.5 shrink-0" aria-hidden />
            <span>{hint.text ?? "Thinking of a clue…"}{hint.source === "offline" && <span className="block text-[12px] opacity-70">From Bostie&apos;s notes</span>}</span>
          </p>
        )}

        {pinning && !answered ? (
          <div className="mt-3">
            <p className="mb-2 text-[14px] text-ink-soft">Tap the map to drop your pin. Within {formatDistance(PIN_CORRECT_KM)} counts as correct.</p>
            <div className="relative h-[280px] overflow-hidden rounded-3xl border border-line">
              <CityMap className="size-full" markers={pinMarkers} center={BOSTON} zoom={13} onMapClick={setPin} />
            </div>
            <Button className="mt-3 w-full" disabled={!pin} onClick={lockPin}>{pin ? "Lock in this pin" : "Tap the map first"}</Button>
          </div>
        ) : (
          <div data-tour="guess-input" role="group" aria-label="Answers" data-qid={q.id} className="mt-3 grid gap-2">
            {q.options.map((name, n) => {
              const right = !!answered && name === q.answer;
              const wrongPick = !!answered && answered.picked === name && !answered.correct;
              const gone = removed.includes(name) && !answered;
              return (
                <button
                  key={name}
                  onClick={() => choose(name)}
                  disabled={!!answered || gone}
                  className={cx(
                    "flex min-h-[52px] items-center gap-3 rounded-2xl border px-3.5 py-2 text-left text-[16px] font-semibold transition-colors",
                    right ? "border-forest bg-moss text-forest-deep" : wrongPick ? "border-t-red bg-[#fbe4e1] text-[#8a1a12]" : gone ? "border-line bg-sand text-ink-faint line-through" : "border-line bg-card",
                  )}
                >
                  <span aria-hidden className={cx("grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-bold", right ? "bg-forest text-paper" : wrongPick ? "bg-t-red text-white" : "bg-sand text-ink-soft")}>
                    {right ? <Check size={15} strokeWidth={3.5} aria-hidden /> : wrongPick ? <X size={15} strokeWidth={3.5} aria-hidden /> : n + 1}
                  </span>
                  <span className="min-w-0 flex-1">{name}</span>
                </button>
              );
            })}
          </div>
        )}

        {answered && (
          <div className="mt-3 rounded-2xl border border-line bg-card px-4 py-3" aria-live="polite" data-testid="answer-note">
            <p className={cx("text-[13.5px] font-bold", answered.correct ? "text-forest" : "text-t-red")}>
              {answered.km !== undefined ? `${formatDistance(answered.km)} from the spot. ` : ""}
              {answered.correct ? `Correct, +${answered.points} points` : `It was ${q.answer}`}
            </p>
            {q.note && <p className="mt-1 text-[14.5px] leading-snug">{firstSentence(q.note)}</p>}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-line bg-card px-4 pb-3 pt-3">
        {answered ? (
          <Button size="lg" className="w-full" onClick={next}>{last ? "See results" : "Next question"}</Button>
        ) : (
          <div data-tour="round-tools" className="flex items-center justify-between text-[14px] font-semibold">
            <button onClick={askHint} disabled={!!hint} className="flex h-10 items-center gap-1.5 text-forest disabled:text-ink-faint">
              <Lightbulb size={16} aria-hidden /> {hint ? "Hint used" : "Hint (half points)"}
            </button>
            <button onClick={() => setPinning(!pinning)} className="flex h-10 items-center gap-1.5 text-forest">
              <MapPin size={16} aria-hidden /> {pinning ? "Pick an answer instead" : "Pin it instead"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
