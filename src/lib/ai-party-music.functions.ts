import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { composePartyMusicWithAI } from "@/lib/ai-party-music.server";

const requestSchema = z.object({ description: z.string().max(300) }).strict()
  .transform(({ description }) => ({ description: description.trim() }));

export const composePartyMusic = createServerFn({ method: "POST" })
  .validator((input: unknown) => requestSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) {
      return { ok: false as const, status: 401, error: "Secure AI access is not configured for this workspace." };
    }
    return composePartyMusicWithAI(data.description, apiKey);
  });
