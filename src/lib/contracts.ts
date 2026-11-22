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

// --- Trips ---------------------------------------------------------------------

/** A real place, checked against Google Places (or OpenStreetMap when Google is not set up). */
export type TripPlace = PlaceHit & {
  category: string | null;
  rating: number | null;
  /** Google's price level: 0 free to 4 very expensive. */
  priceLevel: 0 | 1 | 2 | 3 | 4 | null;
  /** Google's published price range per person, in US dollars, when it has one. */
  priceRange: { low: number; high: number } | null;
  /** `periods` are minutes from midnight; `close` runs past 1440 when open after midnight. */
  hours: { week: string[]; periods: { day: number; open: number; close: number }[] } | null;
  /** A Google photo reference, shown through /api/trips/photo. */
  photo: string | null;
  summary: string | null;
  provider: "google" | "openstreetmap" | "catalogue";
};
/** A place in an itinerary: the verified place, why it is there, and how long to stay. */
export type TripStop = TripPlace & { why: string | null; minutes: number };
export type Skipped = { name: string; reason: string };

const Frame = z.string().min(100).max(600_000);
export const TripImportRequest = z.object({
  /** Screenshots, or still frames taken from a video in the browser: base64 JPEG. */
  images: z.array(Frame).max(8).default([]),
  /** A public YouTube link, watched by Gemini directly. */
  youtube: z.string().max(200).optional(),
});
export const TripImportOutput = z.object({
  summary: z.string().max(240).describe("One sentence on what the video or picture is about"),
  places: z.array(z.object({
    name: z.string().max(80).describe("The place's real name, as it would appear on a map"),
    evidence: z.string().max(140).describe("What in the frames shows it: a sign, a caption, spoken words, a recognizable building"),
    minutes: z.number().describe("A sensible visit length in minutes, 20 to 180"),
  })).max(12),
});
export type TripImportResponse = { summary: string; found: TripStop[]; skipped: Skipped[]; meta: AiMeta | null };

export const TripGenerateRequest = z.object({
  interests: z.array(z.string().max(30)).max(8),
  /** 0 free only, 1 low, 2 comfortable, 3 treat yourself */
  budget: z.number().int().min(0).max(3),
  days: z.number().int().min(1).max(3),
  /** Hours out per day. */
  hours: z.number().int().min(2).max(10),
  startStationId: z.string().max(40),
  note: z.string().max(200).optional(),
});
export const TripGenerateOutput = z.object({
  title: z.string().max(60).describe("A short name for the trip"),
  days: z.array(z.object({
    stops: z.array(z.object({
      name: z.string().max(80).describe("A real place in Greater Boston, by its map name"),
      why: z.string().max(140).describe("Why it suits this traveller, one sentence"),
      minutes: z.number().describe("Visit length in minutes, 20 to 180"),
    })).max(7),
  })).max(3),
});
export type TripGenerateResponse = { title: string; days: TripStop[][]; skipped: Skipped[]; source: "gemini" | "rules"; meta: AiMeta | null };
export type TripPlacesResponse = { provider: "google" | "openstreetmap"; places: TripPlace[] };

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
