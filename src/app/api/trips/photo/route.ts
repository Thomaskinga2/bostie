// Trips: a Google place photo, fetched here so the Google key never reaches the browser.
// Text Search does not always hand back photo references, so a place id is also accepted
// and looked up with Place Details. No photo is a normal answer (404): the card shows an icon.
import { fail, rateLimited } from "@/lib/server/http";

const REF = /^places\/[\w-]+\/photos\/[\w-]+$/;
// ponytail: per-instance memory cache of place id -> photo reference (they expire, so one hour only).
const refs = new Map<string, { at: number; ref: string | null }>();

async function refFor(placeId: string, key: string): Promise<string | null> {
  const hit = refs.get(placeId);
  if (hit && Date.now() - hit.at < 3_600_000) return hit.ref;
  const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, { headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "id,photos" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
  const data = res.ok ? ((await res.json()) as { photos?: { name?: string }[] }) : {};
  const ref = data.photos?.[0]?.name ?? null;
  refs.set(placeId, { at: Date.now(), ref: ref && REF.test(ref) ? ref : null });
  if (refs.size > 500) refs.clear();
  return refs.get(placeId)?.ref ?? null;
}

export async function GET(req: Request) {
  if (rateLimited(req, "trip-photo", 120)) return fail(429, "rate_limited");
  const params = new URL(req.url).searchParams;
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return fail(404, "no_photo");
  try {
    const given = params.get("ref") ?? "";
    const id = (params.get("id") ?? "").replace(/^g:/, "");
    // Only ever a photo reference Google handed out, or a plain place id to look one up for.
    const ref = REF.test(given) ? given : /^[\w-]{10,200}$/.test(id) ? await refFor(id, key) : null;
    if (!ref) return fail(404, "no_photo");
    const res = await fetch(`https://places.googleapis.com/v1/${ref}/media?maxWidthPx=640&key=${key}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok || !res.body) return fail(404, "no_photo");
    return new Response(res.body, { headers: { "content-type": res.headers.get("content-type") ?? "image/jpeg", "cache-control": "public, max-age=86400" } });
  } catch {
    return fail(502, "photo_unavailable");
  }
}
