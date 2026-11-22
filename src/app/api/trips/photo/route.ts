// Trips: a Google place photo, fetched here so the Google key never reaches the browser.
import { fail, rateLimited } from "@/lib/server/http";

export async function GET(req: Request) {
  if (rateLimited(req, "trip-photo", 120)) return fail(429, "rate_limited");
  const ref = new URL(req.url).searchParams.get("ref") ?? "";
  const key = process.env.GOOGLE_MAPS_API_KEY;
  // Only ever a photo resource name that Google itself handed out.
  if (!key || !/^places\/[\w-]+\/photos\/[\w-]+$/.test(ref)) return fail(404, "no_photo");
  try {
    const res = await fetch(`https://places.googleapis.com/v1/${ref}/media?maxWidthPx=640&key=${key}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok || !res.body) return fail(404, "no_photo");
    return new Response(res.body, { headers: { "content-type": res.headers.get("content-type") ?? "image/jpeg", "cache-control": "public, max-age=86400, immutable" } });
  } catch {
    return fail(502, "photo_unavailable");
  }
}
