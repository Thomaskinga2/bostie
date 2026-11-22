"use client";
import { Camera, Check, ImageUp, RotateCcw, Share2, X } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ShareSheet } from "@/components/ShareSheet";
import { GeminiChip } from "@/components/shell/Showcase";
import { StampArt } from "@/components/Stamp";
import { Button, cx, SourceBadge } from "@/components/ui";
import { ApiError, post, toJpegBase64 } from "@/lib/api";
import { landmarkCard } from "@/lib/share";
import type { ScanResponse } from "@/lib/contracts";
import { derive, STAMP, XP } from "@/lib/gamification";
import { BOSTON } from "@/lib/geo";
import { nearbyLandmarks, photoOf, PLACE } from "@/lib/places";
import { useStore, useWhere } from "@/lib/store";

type Phase =
  | { name: "idle" }
  | { name: "analyzing"; preview: string }
  | { name: "result"; preview: string; res: ScanResponse; duplicate: boolean }
  | { name: "error"; preview: string; message: string };

const timestamp = () => Date.now();

export default function ScanPage() {
  const where = useWhere();
  const demo = useStore((s) => s.demo);
  const events = useStore((s) => s.events);
  const reward = useStore((s) => s.reward);
  const logAi = useStore((s) => s.logAi);
  const geoStatus = useStore((s) => s.geoStatus);
  const requestLocation = useStore((s) => s.requestLocation);

  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const name = useStore((s) => s.name);
  const [sharing, setSharing] = useState(false);
  const [camera, setCamera] = useState<"off" | "starting" | "on" | "blocked" | "unsupported">("off");
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const found = useMemo(() => derive(events).landmarks, [events]);
  const samples = useMemo(() => nearbyLandmarks(where.at ?? BOSTON, 4), [where.at]);

  const stopCamera = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);
  useEffect(() => stopCamera, [stopCamera]);

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) return setCamera("unsupported");
    setCamera("starting");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false });
      setCamera("on");
      if (video.current) {
        video.current.srcObject = stream.current;
        await video.current.play().catch(() => {});
      }
    } catch {
      setCamera("blocked");
    }
  };

  const analyze = async (source: Blob | HTMLVideoElement) => {
    let preview = "";
    try {
      const { base64, dataUrl } = await toJpegBase64(source);
      preview = dataUrl;
      setPhase({ name: "analyzing", preview });
      stopCamera();
      setCamera("off");
      const res = await post<ScanResponse>("/api/scan", {
        image: base64,
        mimeType: "image/jpeg",
        location: where.at ? { lat: where.at.lat, lng: where.at.lng, source: where.source } : undefined,
      });
      const id = res.validation.landmarkId;
      const duplicate = !!id && found.has(id);
      logAi(
        res.meta,
        res.result,
        !id ? `No stamp: ${res.validation.checks.find((c) => !c.ok)?.name ?? "validation"} check failed`
          : duplicate ? `Recognised ${PLACE[id].name}; already collected, no duplicate reward`
          : `Unlocked the ${PLACE[id].name} stamp (${res.validation.verification})`,
      );
      // The photo itself is never stored: only this event is.
      if (id && !duplicate) reward({ t: "landmark", id, at: timestamp(), verification: res.validation.verification ?? "photo-only" });
      setPhase({ name: "result", preview, res, duplicate });
    } catch (e) {
      setPhase({ name: "error", preview, message: e instanceof ApiError ? e.message : "That image could not be read. Try a JPEG or PNG photo." });
    }
  };

  const trySample = async (id: string) => {
    setPhase({ name: "analyzing", preview: photoOf(id)!.src });
    try {
      const blob = await (await fetch(photoOf(id)!.src.replace("/960px-", "/500px-"))).blob();
      await analyze(blob);
    } catch {
      setPhase({ name: "error", preview: "", message: "Could not load the sample photo. Check your connection." });
    }
  };

  const reset = () => setPhase({ name: "idle" });

  // ---- result ---------------------------------------------------------------
  if (phase.name === "result") {
    const { res, duplicate } = phase;
    const id = res.validation.landmarkId;
    const stamp = id ? STAMP[`landmark:${id}`] : null;
    const headline = stamp ? (duplicate ? "Already in your passport" : "Landmark verified") : res.result.status === "uncertain" ? "Not sure yet" : res.result.status === "recognized" ? "Could not verify" : "No landmark found";
    return (
      <div data-scene="scan-result" className="scroll-area h-full px-5 pb-8 pt-4">
        <div className="flex items-start gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- local data URL preview */}
          <img src={phase.preview} alt="Your photo" className="size-[92px] shrink-0 rounded-2xl object-cover" />
          <div className="min-w-0">
            <p className={cx("text-[14px] font-semibold", stamp ? "text-forest" : "text-ink-soft")}>{headline}</p>
            <h1 className="text-[26px] font-bold leading-[1.1]">{stamp ? stamp.name : res.result.landmarkName || "Try another photo"}</h1>
          </div>
        </div>

        {stamp ? (
          <div data-tour="scan-stamp" className="mt-5 flex items-center gap-4 rounded-3xl border border-line bg-card p-4 shadow-card">
            <div className="w-[92px] shrink-0"><StampArt stamp={stamp} owned /></div>
            <div className="min-w-0">
              <p className="text-[15px] font-bold text-forest">{duplicate ? "Stamp already collected" : "New stamp for your passport"}</p>
              <p className="mt-1 text-[14px] text-ink-soft">Landmark stamps are unlocked by a verified photo.</p>
              {!duplicate && (
                <p className="mt-1.5 text-[15px] font-bold text-gold">
                  +{res.validation.verification === "photo-only" ? XP.landmarkPhotoOnly : XP.landmarkVerified} XP
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-5 rounded-2xl bg-sand px-4 py-3.5 text-[15px] leading-snug">
            {res.result.uncertaintyReason ?? "Gemini could not match this photo to a landmark in the collection. Frame the whole building in good light and try again."}
          </p>
        )}

        {res.result.historicalSummary && stamp && (
          <section className="mt-6">
            <h2 className="text-[21px] font-bold">Information</h2>
            <p className="mt-1.5 text-[16px] leading-relaxed">{res.result.historicalSummary}</p>
            <p className="mt-1.5 text-[12.5px] text-ink-faint">Written by Gemini from Bostie&apos;s reference notes.</p>
          </section>
        )}

        <section data-tour="scan-checks" className="mt-6">
          <h2 className="text-[21px] font-bold">Verification checks</h2>
          <p className="mt-0.5 text-[13.5px] text-ink-soft">Gemini recommends. These rules decide.</p>
          <ul className="mt-2 divide-y divide-line">
            {res.validation.checks.map((c) => (
              <li key={c.name} className="flex items-start gap-3 py-2.5">
                <span className={cx("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-white", c.ok ? "bg-forest" : "bg-ink-faint")}>
                  {c.ok ? <Check size={12} strokeWidth={3.5} aria-label="Passed" /> : <X size={12} strokeWidth={3.5} aria-label="Not passed" />}
                </span>
                <span className="min-w-0 text-[14.5px]">
                  <span className="font-bold">{c.name}</span>
                  <span className="block text-ink-soft">{c.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <div className="mt-6 flex flex-col gap-2.5">
          {stamp && (
            <Button variant="gold" onClick={() => setSharing(true)} data-tour="scan-share">
              <Share2 size={18} aria-hidden /> Share this discovery
            </Button>
          )}
          {stamp && <Link href="/passport" className="inline-flex h-12 items-center justify-center rounded-full bg-forest text-[16px] font-semibold text-paper shadow-lift">View in passport</Link>}
          <Button variant="secondary" onClick={reset}><RotateCcw size={17} aria-hidden /> Scan another</Button>
          <GeminiChip className="self-center" />
        </div>
        {stamp && id && (
          <ShareSheet
            open={sharing}
            onClose={() => setSharing(false)}
            title="Share this discovery"
            filename={`bostie-${id}.png`}
            caption={`I found ${PLACE[id].name} on the T with Bostie.`}
            // Your photo is used once to draw this picture. It is not stored.
            make={() => landmarkCard({ photo: phase.preview, place: PLACE[id], rider: name, at: timestamp() })}
          />
        )}
      </div>
    );
  }

  // ---- viewfinder -----------------------------------------------------------
  const busy = phase.name === "analyzing";
  return (
    <div data-scene="scan" className="scroll-area flex h-full flex-col px-5 pb-6 pt-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[32px] font-bold leading-[1.05]">Scan a landmark</h1>
          <p className="mt-1 text-[15px] text-ink-soft">Photograph it and Gemini verifies what you found.</p>
        </div>
      </div>

      <div data-tour="viewfinder" className="relative mt-4 aspect-[4/5] max-h-[46dvh] w-full shrink-0 overflow-hidden rounded-[28px] bg-ink">
        <video ref={video} playsInline muted className={cx("size-full object-cover", camera !== "on" && "hidden")} />
        {(busy || phase.name === "error") && phase.preview && (
          // eslint-disable-next-line @next/next/no-img-element -- local preview
          <img src={phase.preview} alt="" className="absolute inset-0 size-full object-cover" />
        )}
        {/* corner brackets */}
        {["left-4 top-4 border-l-[3px] border-t-[3px] rounded-tl-xl", "right-4 top-4 border-r-[3px] border-t-[3px] rounded-tr-xl", "left-4 bottom-4 border-l-[3px] border-b-[3px] rounded-bl-xl", "right-4 bottom-4 border-r-[3px] border-b-[3px] rounded-br-xl"].map((c) => (
          <span key={c} aria-hidden className={cx("absolute size-9 border-paper/85", c)} />
        ))}
        {busy && (
          <>
            <motion.span aria-hidden className="absolute inset-x-6 h-[3px] rounded-full bg-gold shadow-[0_0_18px_4px_rgb(184_134_43/0.7)]" initial={{ top: "8%" }} animate={{ top: ["8%", "90%", "8%"] }} transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }} />
            <p role="status" className="absolute inset-x-0 bottom-5 text-center text-[15px] font-semibold text-paper drop-shadow">Gemini is studying the photo…</p>
          </>
        )}
        {!busy && camera !== "on" && phase.name !== "error" && (
          <div className="absolute inset-0 grid place-items-center px-8 text-center text-paper">
            <div>
              <Camera size={34} className="mx-auto text-paper/70" aria-hidden />
              <p className="mt-3 text-[15px] leading-snug text-paper/85">
                {camera === "blocked" ? "Camera access is blocked. Allow it in your browser settings, or upload a photo instead."
                  : camera === "unsupported" ? "This browser has no camera access. Upload a photo instead."
                  : "The camera only turns on when you ask."}
              </p>
              {(camera === "off" || camera === "starting") && (
                <Button variant="gold" className="mt-4" onClick={startCamera} disabled={camera === "starting"}>
                  {camera === "starting" ? "Starting…" : "Turn on camera"}
                </Button>
              )}
            </div>
          </div>
        )}
        {phase.name === "error" && (
          <div className="absolute inset-0 grid place-items-center bg-ink/75 px-8 text-center text-paper">
            <div>
              <p role="alert" className="text-[16px] font-semibold leading-snug">{phase.message}</p>
              <Button variant="gold" className="mt-4" onClick={reset}>Try again</Button>
            </div>
          </div>
        )}
      </div>

      <div data-tour="scan-controls" className="mt-4 flex items-center justify-center gap-6">
        <button
          onClick={() => file.current?.click()}
          disabled={busy}
          className="flex w-[84px] flex-col items-center gap-1 text-[12.5px] font-semibold text-ink-soft disabled:opacity-40"
        >
          <span className="grid size-12 place-items-center rounded-full border border-line bg-card"><ImageUp size={20} aria-hidden /></span>
          Upload photo
        </button>
        <button
          onClick={() => video.current && analyze(video.current)}
          disabled={camera !== "on" || busy}
          aria-label="Take photo"
          className="grid size-[76px] place-items-center rounded-full border-[5px] border-forest bg-card transition active:scale-95 disabled:border-line disabled:opacity-50"
        >
          <span className="size-[56px] rounded-full bg-forest" />
        </button>
        <span className="w-[84px] text-center text-[12.5px] text-ink-faint">
          {where.source === "simulated" ? <SourceBadge kind="simulated" /> : where.source === "gps" ? "Location on" : (
            <button onClick={requestLocation} className="font-semibold text-forest underline underline-offset-2" disabled={geoStatus === "asking"}>
              {geoStatus === "denied" ? "Location blocked" : geoStatus === "asking" ? "Locating…" : "Add location"}
            </button>
          )}
        </span>
        <input
          ref={file}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) analyze(f);
          }}
        />
      </div>

      <section data-tour="scan-samples" className="mt-6">
        <h2 className="text-[20px] font-bold">{demo ? "Not in Boston? Use a sample photo" : "Try it with a sample photo"}</h2>
        <p className="mt-0.5 text-[13.5px] text-ink-soft">Real Wikimedia Commons photos of landmarks near {where.source ? "you" : "downtown"}. The Gemini call is live.</p>
        <ul className="mt-3 grid grid-cols-4 gap-2.5">
          {samples.map(({ place }) => (
            <li key={place.id}>
              <button onClick={() => trySample(place.id)} disabled={busy} className="block w-full text-left disabled:opacity-40" aria-label={`Use a sample photo of ${place.name}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- Commons thumbnail */}
                <img src={photoOf(place.id)!.src.replace("/960px-", "/250px-")} alt="" loading="lazy" className="aspect-square w-full rounded-2xl object-cover" />
                <span className="mt-1 line-clamp-2 block text-[11.5px] font-semibold leading-tight">{place.name}</span>
                {found.has(place.id) && <span className="text-[11px] text-forest">Collected</span>}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-5 text-[12.5px] leading-snug text-ink-faint">
        Photos are sent to Google Gemini for recognition and are not stored by Bostie. If you share a discovery, your photo is used once to make that picture. Please avoid photographing people, and never scan from a platform edge or roadway.
      </p>
    </div>
  );
}
