import { generateText, NoObjectGeneratedError, Output } from "ai";
import { z } from "zod";
import { createGatewayModel, GATEWAY_PROVIDER_OPTIONS, gatewayErrorResult, type GatewayFailure } from "@/lib/ai-gateway.server";
import { normalizeSunoPrompt, SUNO_PROMPT_MAX } from "@/lib/suno-prompt";

const outputSchema = z.object({ prompt: z.string() }).strict();

export type SunoPromptGeneration = { ok: true; prompt: string } | GatewayFailure;

const UNUSABLE = "The AI's prompt couldn't be used. Try again, or use the prompt written from your mood.";

export async function writeSunoPromptWithAI(mood: string, apiKey: string): Promise<SunoPromptGeneration> {
  try {
    const result = await generateText({
      model: createGatewayModel(apiKey),
      instructions: [
        "Write a prompt for the Suno AI music generator, for a full modern song to play at a party for the Hariyana Vidya Mandir smart-city model.",
        "Describe only the music: genre and sub-genre, mood, tempo (bpm), key instruments and production, vocal style, and the overall feel or theme, the way a current chart hit would be described.",
        "Never include lyrics, lyric lines, song sections like [Verse] or [Chorus], quotes, a title, or artist names.",
        `Write one line of comma-separated descriptors, at most ${SUNO_PROMPT_MAX} characters. Follow the operator's mood; if it is empty, make an upbeat celebration song.`,
      ].join(" "),
      messages: [{ role: "user", content: mood || "An upbeat celebration for the smart city." }],
      output: Output.object({ schema: outputSchema }),
      maxRetries: 0,
      providerOptions: GATEWAY_PROVIDER_OPTIONS,
    });
    const prompt = normalizeSunoPrompt(result.output.prompt);
    return prompt ? { ok: true, prompt } : { ok: false, status: null, error: UNUSABLE };
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) return { ok: false, status: null, error: UNUSABLE };
    return gatewayErrorResult(error, "Could not write the Suno prompt. Try again, or use the prompt written from your mood.");
  }
}
