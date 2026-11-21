"use client";
import { Check, ChevronLeft, Lightbulb, MapPin, Send, Sparkles, Type } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { GeminiChip } from "@/components/shell/Showcase";
import { Button, cx, Meter, NamedIcon, PageHeader, Photo } from "@/components/ui";
import { post } from "@/lib/api";
import type { DebriefResponse, GuessResponse, HintResponse } from "@/lib/contracts";
import {
  candidatePool, HINT_PENALTY, MAX_ATTEMPTS, MAX_HINTS, MODES, pickRandom, scoreMap, scoreText, skillTier, WRONG_PENALTY, type GameMode,
} from "@/lib/game";
import { CHALLENGES, challengeProgress, derive, XP } from "@/lib/gamification";
import { BOSTON, distanceKm, formatDistance, type LatLng } from "@/lib/geo";
import { PLACE } from "@/lib/places";
import { useStore } from "@/lib/store";
import type { MapMarker } from "@/components/map/CityMap";

const CityMap = dynamic(() => import("@/components/map/CityMap").then((m) => m.CityMap), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse bg-sand" />,
});

type Guess = { text: string; verdict: GuessResponse["verdict"]; feedback: string; understood: string | null };
type Round = {
  id: string;
  placeId: string;
  mode: GameMode;
  startedAt: number;
  guesses: Guess[];
  hints: { text: string; source: "gemini" | "offline" }[];
  pickedBy?: { reason: string; chosenBy: "gemini" | "random"; tier: number };
  result?: { correct: boolean; score: number; km: number | null; pin: LatLng | null };
  /** undefined = loading, null = Gemini unavailable */
  debrief?: DebriefResponse | null;
};

const TIER_NAME = ["", "Easy", "Medium", "Hard"];
const xpFor = (score: number) => Math.max(XP.roundMin, Math.round(score / 20));

export default function PlayPage() {
  const events = useStore((s) => s.events);
  const challenges = useStore((s) => s.challenges);
  const startChallenge = useStore((s) => s.startChallenge);
  const reward = useStore((s) => s.reward);
  const logAi = useStore((s) => s.logAi);
  const d = useMemo(() => derive(events), [events]);

  const [mode, setMode] = useState<GameMode>("mix");
  const [round, setRound] = useState<Round | null>(null);
  const [input, setInput] = useState<"text" | "pin">("text");
  const [text, setText] = useState("");
  const [pin, setPin] = useState<LatLng | null>(null);
  const [busy, setBusy] = useState<"guess" | "hint" | null>(null);
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"available" | "active" | "completed">("available");
  const scroller = useRef<HTMLDivElement>(null);

  const tier = skillTier(d.rounds);
  // CityMap wants stable array props.
  const pinMarkers = useMemo<MapMarker[]>(() => (pin ? [{ id: "pin", kind: "pin", label: "Your pin", ...pin }] : []), [pin]);
  const result = round?.result;
  const answer = round ? PLACE[round.placeId] : null;
  const missMap = useMemo(() => {
    if (!result?.pin || !answer) return null;
    const target = { lat: answer.lat, lng: answer.lng };
    return {
      markers: [
        { id: "pin", kind: "pin", label: "Your pin", ...result.pin },
        { id: "answer", kind: "answer", label: answer.name, ...target },
      ] as MapMarker[],
      lines: [{ id: "miss", color: "#1d2320", path: [result.pin, target], emphasis: true }],
      fit: [result.pin, target],
    };
  }, [result, answer]);

  const begin = (m: GameMode, placeId?: string, pickedBy?: Round["pickedBy"]) => {
    const id = placeId ?? pickRandom(candidatePool(m, tier, d.rounds.map((r) => r.place))).id;
    setRound({ id: `${Date.now().toString(36)}-${id}`, placeId: id, mode: m, startedAt: Date.now(), guesses: [], hints: [], pickedBy });
    setInput(m === "map" ? "pin" : "text");
    setText("");
    setPin(null);
    scroller.current?.scrollTo({ top: 0 });
  };

  const finish = (r: Round, correct: boolean, pinned: LatLng | null) => {
    const place = PLACE[r.placeId];
    const seconds = (Date.now() - r.startedAt) / 1000;
    const km = pinned ? distanceKm(pinned, place) : null;
    const wrong = r.guesses.filter((g) => g.verdict !== "correct").length;
    const scored = pinned
      ? scoreMap({ km: km!, hints: r.hints.length, seconds })
      : { correct, score: scoreText({ correct, wrong, hints: r.hints.length, seconds }) };
    const done: Round = { ...r, result: { correct: scored.correct, score: scored.score, km, pin: pinned } };
    setRound(done);
    scroller.current?.scrollTo({ top: 0 });
    reward({ t: "round", id: r.id, place: r.placeId, mode: r.mode, correct: scored.correct, score: scored.score, hints: r.hints.length, at: Date.now() });

    post<DebriefResponse>("/api/game/debrief", {
      placeId: r.placeId, mode: r.mode, guesses: r.guesses.map((g) => g.text), correct: scored.correct, score: scored.score,
      hints: r.hints.length, pinKm: km, recent: d.rounds.slice(-8).map((x) => ({ place: x.place, correct: x.correct, score: x.score })),
    })
      .then((res) => {
        logAi(res.meta, res.debrief, `Debrief shown; next round ${res.next.chosenBy === "gemini" ? `"${PLACE[res.next.placeId].name}" accepted (in the tier ${res.next.tier} pool)` : "picked at random (model choice rejected)"}`);
        setRound((cur) => (cur?.id === r.id ? { ...cur, debrief: res } : cur));
      })
      .catch(() => setRound((cur) => (cur?.id === r.id ? { ...cur, debrief: null } : cur)));
  };

  const submitGuess = async () => {
    if (!round || !text.trim() || busy) return;
    const guess = text.trim();
    setBusy("guess");
    setNotice("");
    try {
      const res = await post<GuessResponse>("/api/game/guess", { placeId: round.placeId, guess, previous: round.guesses.map((g) => g.text) });
      logAi(res.meta, res.output, res.verdict === "correct" ? "Server matched the linked id to the answer: correct" : `Linked to ${res.resolved?.name ?? "nothing"}; server ruled "${res.verdict}"`);
      const next: Round = {
        ...round,
        guesses: [...round.guesses, { text: guess, verdict: res.verdict, feedback: res.feedback, understood: res.resolvedBy === "gemini" ? res.resolved!.name : null }],
      };
      setText("");
      const wrong = next.guesses.filter((g) => g.verdict !== "correct").length;
      if (res.verdict === "correct") finish(next, true, null);
      else if (wrong >= MAX_ATTEMPTS) finish(next, false, null);
      else setRound(next);
    } catch {
      setNotice("That guess could not be checked. Check your connection and try again. It did not cost an attempt.");
    } finally {
      setBusy(null);
    }
  };

  const askHint = async () => {
    if (!round || busy || round.hints.length >= MAX_HINTS) return;
    setBusy("hint");
    try {
      const res = await post<HintResponse>("/api/game/hint", { placeId: round.placeId, previous: round.guesses.map((g) => g.text), hints: round.hints.map((h) => h.text) });
      logAi(res.meta, res.output, "Hint passed the answer-leak check and was shown");
      setRound({ ...round, hints: [...round.hints, { text: res.hint, source: res.source }] });
    } catch {
      const cues = PLACE[round.placeId].cues;
      setRound({ ...round, hints: [...round.hints, { text: `Look for: ${cues[round.hints.length % cues.length]}.`, source: "offline" }] });
    } finally {
      setBusy(null);
    }
  };

  // Keep the newest hint or reply in view.
  useEffect(() => {
    if (!round || round.result) return;
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [round?.guesses.length, round?.hints.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- lobby ----------------------------------------------------------------
  if (!round) {
    const lists = {
      available: CHALLENGES.filter((c) => !challenges[c.id]),
      active: CHALLENGES.filter((c) => challenges[c.id] && !challenges[c.id].completedAt),
      completed: CHALLENGES.filter((c) => challenges[c.id]?.completedAt),
    };
    return (
      <div ref={scroller} data-scene="play-lobby" className="scroll-area h-full pb-8">
        <PageHeader title="Guess Boston" sub="One photo. Where in the city is it?" />
        <div className="px-5">
          <div className="relative overflow-hidden rounded-3xl bg-ink text-paper">
            <Photo id="old-state-house" credit={false} className="h-[170px] opacity-70" />
            <dl className="grid grid-cols-3 divide-x divide-white/15 py-3.5 text-center">
              {[[d.stats.rounds, "rounds"], [d.stats.rounds ? `${Math.round(d.stats.accuracy * 100)}%` : "–", "correct"], [d.stats.bestScore || "–", "best score"]].map(([n, label]) => (
                <div key={label}>
                  <dd className="font-display text-[24px] font-bold leading-none">{n}</dd>
                  <dt className="mt-1 text-[12px] text-paper/65">{label}</dt>
                </div>
              ))}
            </dl>
          </div>

          <h2 className="mt-6 text-[22px] font-bold">Pick a game</h2>
          <div data-tour="game-modes" role="radiogroup" aria-label="Game mode" className="mt-2 divide-y divide-line overflow-hidden rounded-3xl border border-line bg-card">
            {MODES.map((m) => (
              <button key={m.id} role="radio" aria-checked={mode === m.id} onClick={() => setMode(m.id)} className="flex w-full items-center gap-3.5 px-4 py-3 text-left">
                <span className={cx("grid size-6 shrink-0 place-items-center rounded-full border-2", mode === m.id ? "border-forest bg-forest text-paper" : "border-line")}>
                  {mode === m.id && <Check size={13} strokeWidth={3.5} aria-hidden />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[16px] font-bold">{m.name}</span>
                  <span className="block text-[13.5px] text-ink-soft">{m.blurb}</span>
                </span>
              </button>
            ))}
          </div>

          <Button size="lg" className="mt-4 w-full" onClick={() => begin(mode)} data-tour="start-round">Start round</Button>
          <p className="mt-2.5 text-center text-[13px] text-ink-soft">
            Difficulty: <strong>{TIER_NAME[tier]}</strong>, set by your last four rounds. Up to 1,200 points and {xpFor(1200)} XP a round.
          </p>
          <div className="mt-3 flex justify-center"><GeminiChip /></div>

          <h2 id="challenges" className="mt-8 scroll-mt-4 text-[22px] font-bold">Challenges</h2>
          <div data-tour="challenges" role="tablist" className="mt-2 flex rounded-full bg-sand p-1">
            {(["available", "active", "completed"] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cx("h-9 flex-1 rounded-full text-[14px] font-semibold capitalize", tab === t ? "bg-card text-ink shadow-card" : "text-ink-soft")}>
                {t} ({lists[t].length})
              </button>
            ))}
          </div>
          {lists[tab].length ? (
            <ul className="mt-1 divide-y divide-line">
              {lists[tab].map((c) => {
                const have = challengeProgress(c, challenges[c.id], events);
                return (
                  <li key={c.id} className="flex items-center gap-3.5 py-3.5">
                    <span className={cx("grid size-11 shrink-0 place-items-center rounded-2xl", tab === "completed" ? "bg-gold text-forest-deep" : "bg-moss text-forest")}>
                      <NamedIcon name={c.icon} size={21} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[16px] font-bold">{c.title}</span>
                      <span className="block text-[13.5px] leading-snug text-ink-soft">{c.description}</span>
                      {tab === "active" && (
                        <span className="mt-1.5 flex items-center gap-2 text-[12.5px] font-semibold text-ink-soft">
                          <Meter value={have / c.goal} className="flex-1" /> {have} of {c.goal}
                        </span>
                      )}
                    </span>
                    {tab === "available" ? (
                      <Button size="sm" variant="secondary" onClick={() => (startChallenge(c.id), setTab("active"))} aria-label={`Accept ${c.title}`}>
                        Accept
                      </Button>
                    ) : (
                      <span className="shrink-0 text-[13.5px] font-bold text-gold">{tab === "completed" ? "Earned " : "+"}{c.xp} XP</span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-3 rounded-2xl bg-sand px-4 py-4 text-center text-[14.5px] text-ink-soft">
              {tab === "available" ? "You have accepted every challenge. More are on the way." : tab === "active" ? "Accept a challenge to track it here." : "Finish a challenge and it lands here."}
            </p>
          )}
        </div>
      </div>
    );
  }

  const place = PLACE[round.placeId];
  const wrong = round.guesses.filter((g) => g.verdict !== "correct").length;

  // ---- result ---------------------------------------------------------------
  if (round.result) {
    const { correct, score, km, pin: pinned } = round.result;
    const db = round.debrief;
    return (
      <div ref={scroller} data-scene="play-result" className="scroll-area h-full pb-8">
        <Photo id={place.id} className="h-[210px]" alt={place.name} />
        <div className="px-5 pt-4">
          <p className={cx("text-[14px] font-semibold", correct ? "text-forest" : "text-ink-soft")}>
            {correct ? (pinned ? `Pinned it, ${formatDistance(km!)} off` : wrong ? "Got there" : "First try") : pinned ? `${formatDistance(km!)} away` : "Not this time. It was"}
          </p>
          <h1 className="text-[30px] font-bold leading-[1.08]">{place.name}</h1>
          <p className="mt-0.5 text-[14.5px] text-ink-soft">{place.neighborhood}{place.year ? `, ${place.year}` : ""}</p>

          <dl data-tour="round-score" className="mt-4 flex items-end gap-6 border-y border-line py-3.5">
            <div>
              <dd className="font-display text-[40px] font-bold leading-none text-forest">{score}</dd>
              <dt className="mt-1 text-[12.5px] text-ink-soft">points</dt>
            </div>
            <div>
              <dd className="font-display text-[26px] font-bold leading-none text-gold">+{xpFor(score)}</dd>
              <dt className="mt-1 text-[12.5px] text-ink-soft">XP</dt>
            </div>
            <p className="ml-auto max-w-[15ch] text-right text-[12.5px] leading-snug text-ink-faint">
              {round.hints.length} hint{round.hints.length === 1 ? "" : "s"} (−{HINT_PENALTY} each){pinned ? "" : `, ${wrong} miss${wrong === 1 ? "" : "es"} (−${WRONG_PENALTY} each)`}
            </p>
          </dl>

          {pinned && (
            <div className="relative mt-4 h-[200px] overflow-hidden rounded-3xl border border-line">
              {missMap && <CityMap className="size-full" {...missMap} selectedId="answer" />}
            </div>
          )}

          <section data-tour="round-debrief" className="mt-5" aria-live="polite">
            {db === undefined ? (
              <div className="space-y-2.5" aria-busy>
                <p className="flex items-center gap-2 text-[14px] font-semibold text-ink-soft"><Sparkles size={15} aria-hidden /> Gemini is writing your debrief…</p>
                {[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-2xl bg-sand" />)}
              </div>
            ) : db?.debrief ? (
              <div className="space-y-4">
                {([["The tells", db.debrief.tells], ["Why it matters", db.debrief.history], ["Getting there", db.debrief.transit]] as const).map(([h, body]) => (
                  <div key={h}>
                    <h2 className="text-[19px] font-bold">{h}</h2>
                    <p className="mt-0.5 text-[15.5px] leading-relaxed">{body}</p>
                  </div>
                ))}
                <p className="rounded-2xl bg-moss px-4 py-3 text-[15px] leading-snug text-forest-deep">{db.debrief.coaching}</p>
                <p className="text-[12.5px] text-ink-faint">Debrief written by Gemini from Bostie&apos;s verified notes. Score and answer are decided by code.</p>
              </div>
            ) : (
              <div>
                <h2 className="text-[19px] font-bold">Why it matters</h2>
                <p className="mt-0.5 text-[15.5px] leading-relaxed">{place.summary}</p>
                <p className="mt-1.5 text-[12.5px] text-ink-faint">Gemini is unreachable, so this is Bostie&apos;s reference note.</p>
              </div>
            )}
          </section>

          <div data-tour="next-round" className="mt-6 space-y-2">
            {db?.next.chosenBy === "gemini" && (
              <p className="flex items-start gap-2 text-[13.5px] leading-snug text-ink-soft">
                <Sparkles size={15} className="mt-0.5 shrink-0 text-gold" aria-hidden />
                <span><strong className="text-ink">Up next, {TIER_NAME[db.next.tier].toLowerCase()}:</strong> {db.next.reason}</span>
              </p>
            )}
            <Button
              size="lg"
              className="w-full"
              disabled={db === undefined}
              onClick={() => begin(round.mode, db?.next.placeId, db ? { reason: db.next.reason, chosenBy: db.next.chosenBy, tier: db.next.tier } : undefined)}
            >
              Next round
            </Button>
            <Button variant="quiet" className="w-full" onClick={() => setRound(null)}>Back to games</Button>
          </div>
        </div>
      </div>
    );
  }

  // ---- playing --------------------------------------------------------------
  return (
    <div data-scene="play-round" className="flex h-full flex-col">
      <div ref={scroller} className="scroll-area min-h-0 flex-1">
        <div data-tour="round-photo" className="relative">
          <Photo id={place.id} credit={false} className="h-[250px]" alt="Mystery location" />
          <button onClick={() => setRound(null)} className="absolute left-3 top-3 flex h-9 items-center gap-0.5 rounded-full bg-ink/70 pl-2 pr-3.5 text-[13.5px] font-semibold text-paper">
            <ChevronLeft size={17} aria-hidden /> Quit
          </button>
          <span className="absolute right-3 top-3 rounded-full bg-ink/70 px-3 py-1.5 text-[12.5px] font-semibold text-paper">
            {MODES.find((m) => m.id === round.mode)!.name}, {TIER_NAME[PLACE[round.placeId].difficulty].toLowerCase()}
          </span>
        </div>

        <div className="px-5 pb-4 pt-4">
          <div className="flex items-baseline justify-between">
            <h1 className="text-[25px] font-bold">Where is this?</h1>
            {input === "text" && (
              <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-soft" aria-label={`${MAX_ATTEMPTS - wrong} attempts left`}>
                {Array.from({ length: MAX_ATTEMPTS }, (_, i) => <span key={i} className={cx("size-2.5 rounded-full", i < MAX_ATTEMPTS - wrong ? "bg-forest" : "bg-line")} />)}
              </span>
            )}
          </div>
          {round.pickedBy?.chosenBy === "gemini" && !round.guesses.length && (
            <p className="mt-1 flex items-start gap-1.5 text-[13px] text-ink-soft"><Sparkles size={14} className="mt-0.5 shrink-0 text-gold" aria-hidden /> Picked for you: {round.pickedBy.reason}</p>
          )}

          <ul className="mt-3 space-y-2.5" aria-live="polite">
            {round.hints.map((h, i) => (
              <li key={`h${i}`} className="flex gap-2.5 rounded-2xl bg-gold-soft px-3.5 py-2.5 text-[14.5px] leading-snug text-[#523a09]">
                <Lightbulb size={17} className="mt-0.5 shrink-0" aria-hidden />
                <span>{h.text}{h.source === "offline" && <span className="block text-[12px] opacity-70">Offline hint from Bostie&apos;s notes</span>}</span>
              </li>
            ))}
            {round.guesses.map((g, i) => (
              <li key={`g${i}`}>
                <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-forest px-3.5 py-2 text-[15px] text-paper">{g.text}</p>
                <div className="mt-1.5 w-fit max-w-[92%] rounded-2xl rounded-bl-md border border-line bg-card px-3.5 py-2.5">
                  <p className={cx("text-[12.5px] font-bold", g.verdict === "close" ? "text-gold" : "text-t-red")}>
                    {g.verdict === "close" ? "Close" : "Not it"}{g.understood ? `. Understood as ${g.understood}` : ""}
                  </p>
                  <p className="mt-0.5 text-[14.5px] leading-snug">{g.feedback}</p>
                </div>
              </li>
            ))}
          </ul>

          {input === "pin" && (
            <div className="mt-3">
              <p className="mb-2 text-[14px] text-ink-soft">Tap the map to drop your pin. Within {formatDistance(0.35)} counts as correct.</p>
              <div className="relative h-[300px] overflow-hidden rounded-3xl border border-line">
                <CityMap className="size-full" markers={pinMarkers} center={BOSTON} zoom={13} onMapClick={setPin} />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-line bg-card px-4 pb-3 pt-3">
        {notice && <p role="alert" className="mb-2 text-[13.5px] font-semibold text-t-red">{notice}</p>}
        {input === "text" ? (
          <form data-tour="guess-input" onSubmit={(e) => (e.preventDefault(), submitGuess())} className="flex items-center gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Name it, or describe what you see"
              aria-label="Your guess"
              maxLength={200}
              enterKeyHint="send"
              autoComplete="off"
              className="h-12 min-w-0 flex-1 rounded-full border border-line bg-paper px-4 text-[16px] placeholder:text-ink-faint"
            />
            <button type="submit" disabled={!text.trim() || !!busy} aria-label="Submit guess" className="grid size-12 shrink-0 place-items-center rounded-full bg-forest text-paper disabled:opacity-40">
              {busy === "guess" ? <span className="size-4 animate-spin rounded-full border-2 border-paper/40 border-t-paper" /> : <Send size={19} />}
            </button>
          </form>
        ) : (
          <Button className="w-full" disabled={!pin} onClick={() => pin && finish(round, false, pin)}>
            {pin ? "Lock in this pin" : "Tap the map first"}
          </Button>
        )}
        <div data-tour="round-tools" className="mt-2 flex items-center justify-between text-[13.5px] font-semibold">
          <button onClick={askHint} disabled={!!busy || round.hints.length >= MAX_HINTS} className="flex h-9 items-center gap-1.5 text-forest disabled:text-ink-faint">
            <Lightbulb size={16} aria-hidden />
            {busy === "hint" ? "Thinking…" : round.hints.length >= MAX_HINTS ? "No hints left" : `Hint (${MAX_HINTS - round.hints.length} left)`}
          </button>
          <button onClick={() => setInput(input === "text" ? "pin" : "text")} className="flex h-9 items-center gap-1.5 text-forest">
            {input === "text" ? <MapPin size={16} aria-hidden /> : <Type size={16} aria-hidden />}
            {input === "text" ? "Pin it instead" : "Type it instead"}
          </button>
          <button onClick={() => finish(round, false, null)} className="h-9 text-ink-soft">Reveal</button>
        </div>
      </div>
    </div>
  );
}
