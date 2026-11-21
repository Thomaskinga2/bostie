import "server-only";
import { z } from "zod";

// ponytail: per-instance fixed-window limiter. On serverless each instance counts
// separately, so this only blunts bursts. Move to Upstash/Vercel KV for real quotas.
const hits = new Map<string, { count: number; reset: number }>();

export function rateLimited(req: Request, bucket: string, limit: number, windowMs = 60_000): boolean {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const hit = hits.get(key);
  if (!hit || hit.reset < now) {
    hits.set(key, { count: 1, reset: now + windowMs });
    if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    return false;
  }
  return ++hit.count > limit;
}

export const fail = (status: number, error: string, message?: string) =>
  Response.json({ error, message }, { status });

/** Parses and validates a JSON body; returns a Response on failure. */
export async function readBody<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S> | Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail(400, "bad_json");
  }
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : fail(400, "bad_request", parsed.error.issues[0]?.message);
}
