import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { normalizePlanDescription } from "@/lib/ai-control-plan";
import { generateControlPlanWithAI } from "@/lib/ai-control-plan.server";

const planRequestSchema = z.object({ description: z.string() }).strict().transform(({ description }) => {
  const normalized = normalizePlanDescription(description);
  if (!normalized) throw new Error("Enter a request of 1 to 1,000 characters.");
  return { description: normalized };
});

export const generateAIControlPlan = createServerFn({ method: "POST" })
  .validator((input: unknown) => planRequestSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) {
      return { ok: false as const, status: 401, error: "Secure AI access is not configured for this workspace." };
    }
    return generateControlPlanWithAI(data.description, apiKey);
  });