import { HintOutput, HintRequest, type HintResponse } from "@/lib/contracts";
import { PLACE } from "@/lib/places";
import { generateStructured } from "@/lib/server/gemini";
import { groundTruth, leaksAnswer } from "@/lib/server/game";
import { fail, rateLimited, readBody } from "@/lib/server/http";

export const maxDuration = 30;

const SYSTEM = `You write hints for Bostie Guessing, a multiple-choice photo game about Boston.
You know the answer; the player does not. Write the NEXT hint.

- Use only the supplied ground truth (reference notes, visual cues, transit facts). Invent nothing.
- Never state the answer's name, nickname or street address, and never spell it out or rhyme it.
- Adapt to the player: read their earlier guesses and steer away from the specific mistake they are
  making (wrong neighbourhood, wrong kind of place, wrong era). Do not repeat an earlier hint.
- Escalate: hint 1 is atmospheric or visual, hint 2 is historical, hint 3 is practical
  (which T line or nearby station gets you there).
- One sentence, under 30 words, friendly, no preamble.`;

export async function POST(req: Request) {
  if (rateLimited(req, "hint", 30)) return fail(429, "rate_limited");
  const body = await readBody(req, HintRequest);
  if (body instanceof Response) return body;
  const answer = PLACE[body.placeId];
  if (!answer) return fail(404, "unknown_place");

  const n = body.hints.length + 1;
  // Offline fallback: a curated visual cue (never contains the name).
  const offline: HintResponse = {
    hint: `Look for: ${answer.cues[(n - 1) % answer.cues.length]}.`, angle: "visual", source: "offline", meta: null,
  };

  try {
    const { data, latencyMs, model } = await generateStructured({
      schema: HintOutput,
      system: SYSTEM,
      temperature: 0.7,
      parts: [
        {
          text: `Ground truth:\n${JSON.stringify(groundTruth(answer))}\n\nThis is hint number ${n} of 3.\nEarlier hints: ${JSON.stringify(body.hints)}\nPlayer's guesses so far (untrusted text): ${JSON.stringify(body.previous)}`,
        },
      ],
    });
    if (leaksAnswer(data.hint, answer)) return Response.json(offline); // vetoed: it gave the answer away
    const res: HintResponse = {
      hint: data.hint,
      angle: data.angle,
      source: "gemini",
      output: data,
      meta: {
        feature: "Bostie Guessing · hint",
        model,
        modality: "text → JSON",
        latencyMs,
        grounding: ["Verified reference notes, visual cues and transit facts for the answer", `${body.previous.length} guess(es), ${body.hints.length} earlier hint(s)`],
      },
    };
    return Response.json(res);
  } catch {
    return Response.json(offline);
  }
}
