import { generateText, NoObjectGeneratedError, Output } from "ai";
import { z } from "zod";
import { createGatewayModel, GATEWAY_PROVIDER_OPTIONS, gatewayErrorResult, type GatewayFailure } from "@/lib/ai-gateway.server";
import { MAX_BPM, MAX_PITCH, MIN_BPM, MIN_PITCH, normalizeMotif, type PartyMotif } from "@/lib/party-music";

const motifSchema = z.object({
  title: z.string(),
  bpm: z.number().int(),
  notes: z.array(z.object({
    pitch: z.number().int(),
    sixteenths: z.number().int(),
  }).strict()),
}).strict();

export type PartyMusicGeneration = { ok: true; motif: PartyMotif } | GatewayFailure;

const INCOMPLETE = "The AI's melody couldn't be used. Try again, or use a built-in tune.";

export async function composePartyMusicWithAI(description: string, apiKey: string): Promise<PartyMusicGeneration> {
  try {
    const result = await generateText({
      model: createGatewayModel(apiKey),
      instructions: [
        "Compose a catchy, upbeat, loopable party melody for the Hariyana Vidya Mandir smart-city model.",
        "It is played by a single-voice piezo buzzer on an ESP32, so write one monophonic melody line: no chords, no lyrics.",
        `Write exactly 4 bars of 4/4 (64 sixteenth notes in total) that loop smoothly; the app repeats them to fill one minute.`,
        `Each note has a MIDI pitch from ${MIN_PITCH} to ${MAX_PITCH} (use 0 for a rest) and a length in sixteenth notes of 2, 4, 6 or 8.`,
        `Choose a tempo from ${MIN_BPM} to ${MAX_BPM} bpm. Use a strong, memorable hook with repetition, and end bar 4 so it leads back to bar 1.`,
        "Give it a short, fun title (at most 40 characters). Follow the operator's requested mood or style when they give one.",
      ].join(" "),
      messages: [{ role: "user", content: description || "An upbeat celebration for the smart city." }],
      output: Output.object({ schema: motifSchema }),
      maxRetries: 0,
      providerOptions: GATEWAY_PROVIDER_OPTIONS,
    });
    const motif = normalizeMotif(result.output);
    return motif ? { ok: true, motif } : { ok: false, status: null, error: INCOMPLETE };
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) return { ok: false, status: null, error: INCOMPLETE };
    return gatewayErrorResult(error, "Could not compose the party music. Try again, or use a built-in tune.");
  }
}
