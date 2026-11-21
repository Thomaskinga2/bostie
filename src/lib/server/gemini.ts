import "server-only";
import { GoogleGenAI, type Part } from "@google/genai";
import { z } from "zod";

// Model ids verified against the live models.list endpoint (Nov 2026). Flash-Lite answers
// in about a second, which matters mid-game; the larger Flash models are opt-in via env
// because they were returning 503 "high demand" during development. Whatever is
// configured, the chain below falls through to the next model on overload or timeout.
const FALLBACKS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];
const chain = (preferred?: string) => [...new Set([preferred, process.env.GEMINI_MODEL, ...FALLBACKS].filter((m): m is string => !!m))];
export const TEXT_MODELS = () => chain();
export const VISION_MODELS = () => chain(process.env.GEMINI_VISION_MODEL);

export class GeminiError extends Error {
  constructor(
    public code: "no_key" | "timeout" | "invalid_response" | "upstream",
    message: string,
  ) {
    super(message);
  }
}

let client: GoogleGenAI | null = null;

/**
 * One Gemini call that must return JSON matching `schema`. The response is
 * constrained with a JSON schema AND re-validated with zod, so nothing downstream
 * ever touches an unvalidated model output.
 */
export async function generateStructured<S extends z.ZodType>(opts: {
  schema: S;
  system: string;
  parts: Part[];
  models?: string[];
  /** Per-model attempt timeout. */
  timeoutMs?: number;
  temperature?: number;
}): Promise<{ data: z.infer<S>; latencyMs: number; model: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiError("no_key", "GEMINI_API_KEY is not configured");
  client ??= new GoogleGenAI({ apiKey });

  let last: GeminiError = new GeminiError("upstream", "no model attempted");
  for (const model of opts.models ?? TEXT_MODELS()) {
    const started = Date.now();
    try {
      const res = await client.models.generateContent({
        model,
        contents: [{ role: "user", parts: opts.parts }],
        config: {
          systemInstruction: opts.system,
          responseMimeType: "application/json",
          responseJsonSchema: z.toJSONSchema(opts.schema),
          temperature: opts.temperature ?? 0.4,
          abortSignal: AbortSignal.timeout(opts.timeoutMs ?? 12_000),
        },
      });
      const parsed = opts.schema.safeParse(JSON.parse(res.text ?? ""));
      if (!parsed.success) throw new GeminiError("invalid_response", "Gemini response failed schema validation");
      return { data: parsed.data, latencyMs: Date.now() - started, model };
    } catch (e) {
      const err = e as Error;
      last =
        err instanceof GeminiError ? err
        : err instanceof SyntaxError ? new GeminiError("invalid_response", "Gemini did not return JSON")
        : err.name === "TimeoutError" || err.name === "AbortError" ? new GeminiError("timeout", `${model} timed out`)
        : new GeminiError("upstream", err.message.slice(0, 300));
      console.warn(`[gemini] ${model} failed (${last.code}): ${last.message}`);
    }
  }
  throw last;
}

export const errorStatus = (e: unknown) =>
  e instanceof GeminiError ? { no_key: 503, timeout: 504, invalid_response: 502, upstream: 502 }[e.code] : 500;
export const errorCode = (e: unknown) => (e instanceof GeminiError ? e.code : "internal");
