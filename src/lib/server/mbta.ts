import "server-only";

const API = "https://api-v3.mbta.com";

// Keyless MBTA access is capped at 20 requests/minute, so every upstream call is
// cached. ponytail: per-instance memory cache; fine for a demo, use a shared KV at scale.
const cache = new Map<string, { at: number; data: unknown }>();

export async function mbta<T>(path: string, ttlMs: number): Promise<T> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < ttlMs) return hit.data as T;
  try {
    const res = await fetch(API + path, {
      headers: process.env.MBTA_API_KEY ? { "x-api-key": process.env.MBTA_API_KEY } : {},
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`MBTA ${res.status}`);
    const data = (await res.json()) as T;
    cache.set(path, { at: Date.now(), data });
    return data;
  } catch (e) {
    // Serve slightly stale data rather than nothing during a blip (max 2 minutes old).
    if (hit && Date.now() - hit.at < 120_000) return hit.data as T;
    throw e;
  }
}
