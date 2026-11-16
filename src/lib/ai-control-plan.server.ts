import { generateText, NoObjectGeneratedError, Output } from "ai";
import { z } from "zod";
import {
  normalizeControlPlan,
  PLAN_DEVICE_KEYS,
  PLAN_DEVICES,
  type ControlPlan,
} from "@/lib/ai-control-plan";
import { createGatewayModel, GATEWAY_PROVIDER_OPTIONS, gatewayErrorResult, type GatewayFailure } from "@/lib/ai-gateway.server";

const controlPlanOutputSchema = z.object({
  title: z.string(),
  summary: z.string(),
  powerImpact: z.enum(["Low", "Moderate", "High"]),
  actions: z.array(z.object({
    device: z.enum(PLAN_DEVICE_KEYS),
    enabled: z.boolean(),
  }).strict()),
}).strict();

export type ControlPlanGeneration = { ok: true; plan: ControlPlan } | GatewayFailure;

const INCOMPLETE = "The generated plan was incomplete. Please refine the request and try again.";

export async function generateControlPlanWithAI(description: string, apiKey: string): Promise<ControlPlanGeneration> {
  try {
    // generateText (not streaming) so gateway errors keep their HTTP status, e.g. 429 or 402.
    const result = await generateText({
      model: createGatewayModel(apiKey),
      instructions: [
        "Create a preview-only control plan for the Hariyana Vidya Mandir smart-city model.",
        `Use only these supported device identifiers: ${PLAN_DEVICE_KEYS.map((key) => `${key} (${PLAN_DEVICES[key]})`).join(", ")}.`,
        "Return one action per device, only for devices relevant to the operator's request. Never invent devices or commands.",
        "Do not claim the plan has been applied. Keep the title concise and the summary clear. Estimate power impact as Low, Moderate, or High.",
      ].join(" "),
      messages: [{ role: "user", content: description }],
      output: Output.object({ schema: controlPlanOutputSchema }),
      maxRetries: 0,
      providerOptions: GATEWAY_PROVIDER_OPTIONS,
    });

    const plan = normalizeControlPlan(result.output);
    return plan ? { ok: true, plan } : { ok: false, status: null, error: INCOMPLETE };
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) return { ok: false, status: null, error: INCOMPLETE };
    return gatewayErrorResult(error, "Could not create a control plan. Please refine the request and try again.");
  }
}
