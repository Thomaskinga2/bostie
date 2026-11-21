// Request/response contracts shared by route handlers and the client.
// The *Output schemas are what Gemini is constrained to and validated against.
import { z } from "zod";

export type AiMeta = { feature: string; model: string; modality: string; latencyMs: number; grounding: string[] };

// --- landmark recognition --------------------------------------------------

export const ScanRequest = z.object({
  /** Base64 JPEG/PNG/WebP without the data: prefix. Downscaled client-side. */
  image: z.string().min(100).max(3_000_000),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  location: z
    .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), source: z.enum(["gps", "simulated"]) })
    .optional(),
});

export const RecognitionOutput = z.object({
  status: z.enum(["recognized", "uncertain", "not_a_landmark"]),
  landmarkId: z.string().nullable().describe("An id from the supplied catalogue, or null"),
  landmarkName: z.string(),
  candidates: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        likelihood: z.enum(["high", "medium", "low"]),
        reason: z.string(),
      }),
    )
    .max(3),
  visualEvidence: z.array(z.string()).max(5).describe("Concrete things visible in the photo"),
  historicalSummary: z.string().describe("Two sentences, using only the supplied reference notes"),
  verification: z.enum(["unlock", "retry", "reject"]),
  uncertaintyReason: z.string().nullable(),
});
export type Recognition = z.infer<typeof RecognitionOutput>;

export type ScanCheck = { name: string; ok: boolean; detail: string };
export type ScanResponse = {
  result: Recognition;
  validation: {
    passed: boolean;
    landmarkId: string | null;
    /** How the visit was verified; decides full vs reduced XP. */
    verification: "nearby" | "simulated" | "photo-only" | null;
    checks: ScanCheck[];
  };
  meta: AiMeta;
};

// --- Guess Boston ----------------------------------------------------------

const Guesses = z.array(z.string().max(200)).max(10);

export const GuessRequest = z.object({
  placeId: z.string(),
  guess: z.string().trim().min(1).max(200),
  previous: Guesses.default([]),
});
export const GuessOutput = z.object({
  resolvedId: z.string().nullable().describe("Catalogue id the player's text names, or null"),
  interpretation: z.string().describe("What you understood the player to mean, in a few words"),
  feedback: z.string().describe("One or two friendly sentences. Never names the answer."),
});
export type GuessResponse = {
  verdict: "correct" | "close" | "incorrect";
  resolved: { id: string; name: string } | null;
  resolvedBy: "alias" | "gemini" | "none";
  km: number | null;
  feedback: string;
  /** null when the answer was settled without a model call, or Gemini was unreachable. */
  meta: AiMeta | null;
  output?: unknown;
};

export const HintRequest = z.object({
  placeId: z.string(),
  previous: Guesses.default([]),
  hints: z.array(z.string().max(400)).max(3).default([]),
});
export const HintOutput = z.object({
  hint: z.string().describe("One sentence. Never names the answer."),
  angle: z.enum(["visual", "history", "transit", "geography"]),
});
export type HintResponse = { hint: string; angle: string; source: "gemini" | "offline"; meta: AiMeta | null; output?: unknown };

export const DebriefRequest = z.object({
  placeId: z.string(),
  mode: z.enum(["mix", "landmark", "station", "neighborhood", "map"]),
  guesses: Guesses.default([]),
  correct: z.boolean(),
  score: z.number(),
  hints: z.number().int().min(0).max(3),
  pinKm: z.number().nullable().default(null),
  /** Recent rounds, oldest first: drives the difficulty tier and avoids repeats. */
  recent: z
    .array(z.object({ place: z.string(), correct: z.boolean(), score: z.number() }))
    .max(12)
    .default([]),
});
export const DebriefOutput = z.object({
  tells: z.string().describe("What in the photo gives this place away. One or two sentences."),
  history: z.string().describe("Why it matters to Boston, from the reference notes. One or two sentences."),
  transit: z.string().describe("How to reach it on the T, from the supplied transit facts. One sentence."),
  coaching: z.string().describe("A personal note on this player's guesses. One sentence."),
  nextPlaceId: z.string().describe("Id chosen from the supplied next-round options"),
  nextReason: z.string().describe("Why that round suits this player. One short sentence."),
});
export type DebriefResponse = {
  debrief: z.infer<typeof DebriefOutput> | null;
  next: { placeId: string; reason: string; tier: 1 | 2 | 3; chosenBy: "gemini" | "random" };
  meta: AiMeta | null;
};

// --- MBTA ------------------------------------------------------------------

export type Prediction = {
  id: string;
  route: string;
  headsign: string;
  direction: number;
  /** ISO timestamp of the predicted departure (or arrival at a terminal). */
  at: string;
  status: string | null;
};
export type PredictionsResponse = { source: "live"; fetchedAt: string; stop: string; predictions: Prediction[] };

export type Alert = { id: string; header: string; effect: string; severity: number; routes: string[]; url: string | null };
export type AlertsResponse = { source: "live"; fetchedAt: string; alerts: Alert[] };

// --- place search ----------------------------------------------------------

/** One search result: where a place is. Routing to it is done by the MBTA planner. */
export type PlaceHit = { id: string; name: string; address: string; lat: number; lng: number };
export type PlacesResponse = { provider: "google" | "openstreetmap"; places: PlaceHit[] };
