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

// --- Bostie's Favourite ----------------------------------------------------------


export const HintRequest = z.object({
  placeId: z.string(),
  previous: z.array(z.string().max(200)).max(10).default([]),
  hints: z.array(z.string().max(400)).max(3).default([]),
});
export const HintOutput = z.object({
  hint: z.string().describe("One sentence. Never names the answer."),
  angle: z.enum(["visual", "history", "transit", "geography"]),
});
export type HintResponse = { hint: string; angle: string; source: "gemini" | "offline"; meta: AiMeta | null; output?: unknown };

export const DrawRequest = z.object({
  subjectId: z.string().max(60),
  /** The drawing as base64 JPEG, without the data: prefix. About 1 MB at most. */
  image: z.string().min(100).max(1_400_000),
});
export const DrawOutput = z.object({
  score: z.number().describe("0 to 100: how recognizable the drawing is as the subject. 0 for blank or unrelated."),
  recognizableFeatures: z.array(z.string().max(80)).max(5).describe("Features of the subject that are visible in the drawing"),
  missingFeatures: z.array(z.string().max(80)).max(5).describe("Major features of the subject that are missing"),
  feedback: z.string().max(240).describe("One or two warm, encouraging sentences to the player"),
});
export type DrawResponse = { score: number; recognizableFeatures: string[]; missingFeatures: string[]; feedback: string; source: "gemini" | "blank"; meta: AiMeta | null };

// --- MBTA ------------------------------------------------------------------

export type Prediction = {
  id: string;
  route: string;
  headsign: string;
  direction: number;
  /** ISO timestamp of the departure. */
  at: string;
  status: string | null;
  /** The MBTA's name for the platform this train leaves from, e.g. "Ashmont/Braintree". */
  platform: string | null;
  /** true = from the published timetable, not a live prediction. */
  scheduled: boolean;
};
export type PredictionsResponse = { source: "live" | "scheduled"; fetchedAt: string; stop: string; predictions: Prediction[] };

// --- Google transit routes (optional alternatives) -----------------------------

export type TransitStop = { name: string; lat: number; lng: number };
export type TransitStep =
  | { kind: "walk"; minutes: number; metres: number }
  | {
      kind: "transit"; minutes: number;
      /** Google's TransitVehicleType: BUS, SUBWAY, TRAM, COMMUTER_TRAIN, HEAVY_RAIL, FERRY… */
      vehicle: string;
      /** Short name to show, e.g. "1" or "Red Line". */
      line: string; lineName: string; color: string | null; headsign: string; stops: number; from: TransitStop; to: TransitStop;
    };
export type TransitRoute = { minutes: number; steps: TransitStep[] };
export type TransitRoutesResponse = { provider: "google" | "none"; routes: TransitRoute[] };

export type Alert = { id: string; header: string; effect: string; severity: number; routes: string[]; url: string | null };
export type AlertsResponse = { source: "live"; fetchedAt: string; alerts: Alert[] };

// --- place search ----------------------------------------------------------

/** One search result: where a place is. Routing to it is done by the MBTA planner. */
export type PlaceHit = { id: string; name: string; address: string; lat: number; lng: number };
export type PlacesResponse = { provider: "google" | "openstreetmap"; places: PlaceHit[] };
