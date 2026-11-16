import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { writeSunoPromptWithAI } from "@/lib/ai-suno-prompt.server";

const requestSchema = z.object({ mood: z.string().max(300) }).strict().transform(({ mood }) => ({ mood: mood.trim() }));

export const writeSunoPrompt = createServerFn({ method: "POST" })
  .validator((input: unknown) => requestSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) {
      return { ok: false as const, status: 401, error: "Secure AI access is not configured for this workspace." };
    }
    return writeSunoPromptWithAI(data.mood, apiKey);
  });
