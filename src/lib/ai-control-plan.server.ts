import { createOpenAI } from "@ai-sdk/openai";
import { Output, streamText } from "ai";
import { z } from "zod";
import {
  normalizeControlPlan,
  PLAN_DEVICE_KEYS,
  PLAN_DEVICES,
  type ControlPlan,
} from "@/lib/ai-control-plan";
import { createLovableAiGatewayRunIdFetch } from "@/lib/ai-control-plan-run-id.server";

const PLAN_MODEL = "openai/gpt-6-astra";

const controlPlanOutputSchema = z.object({
  title: z.string(),
  summary: z.string(),
  powerImpact: z.enum(["Low", "Moderate", "High"]),
  actions: z.array(z.object({
    device: z.enum(PLAN_DEVICE_KEYS),
    enabled: z.boolean(),
  }).strict()),
}).strict();

export type ControlPlanGeneration =
  | { ok: true; plan: ControlPlan }
  | { ok: false; error: string; status: number | null };

function readStatus(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("statusCode" in error)) return null;
  const status = error["statusCode"];
  return typeof status === "number" ? status : null;
}

function readSafeMessage(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const body = "responseBody" in error ? error["responseBody"] : undefined;
  if (typeof body === "string") {
    try {
      const parsed: unknown = JSON.parse(body);
      if (parsed && typeof parsed === "object") {
        const record = parsed as Record<string, unknown>;
        if (typeof record["message"] === "string") return record["message"];
        const nested = record["error"];
        if (nested && typeof nested === "object" && typeof (nested as Record<string, unknown>)["message"] === "string") {
          return (nested as Record<string, string>)["message"];
        }
      }
    } catch {
      return null;
    }
  }
  return null;
}

function errorResult(error: unknown): ControlPlanGeneration {
  const status = readStatus(error);
  const upstreamMessage = readSafeMessage(error);
  if (status === 401) {
    return { ok: false, status, error: upstreamMessage ?? "Secure AI access needs to be configured for this workspace." };
  }
  if (status === 402 || status === 403) {
    return { ok: false, status, error: upstreamMessage ?? "AI plan generation is currently blocked for this workspace." };
  }
  if (status === 429) {
    return { ok: false, status, error: upstreamMessage ?? "The plan service is busy. Please try again later." };
  }
  if (status !== null && status >= 500) {
    return { ok: false, status, error: upstreamMessage ?? "The plan service is temporarily unavailable. Please try again later." };
  }
  return { ok: false, status, error: upstreamMessage ?? "Could not create a control plan. Please refine the request and try again." };
}

export async function generateControlPlanWithAI(description: string, apiKey: string): Promise<ControlPlanGeneration> {
  const runIdFetch = createLovableAiGatewayRunIdFetch();
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: {
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
    fetch: runIdFetch.fetch,
  });

  try {
    const result = streamText({
      model: provider.responses(PLAN_MODEL),
      instructions: [
        "Create a preview-only control plan for the Hariyana Vidya Mandir smart-city model.",
        `Use only these supported device identifiers: ${PLAN_DEVICE_KEYS.map((key) => `${key} (${PLAN_DEVICES[key]})`).join(", ")}.`,
        "Return one action per device, only for devices relevant to the operator's request. Never invent devices or commands.",
        "Do not claim the plan has been applied. Keep the title concise and the summary clear. Estimate power impact as Low, Moderate, or High.",
      ].join(" "),
      messages: [{ role: "user", content: description }],
      output: Output.object({ schema: controlPlanOutputSchema }),
      maxRetries: 0,
      providerOptions: {
        openai: {
          forceReasoning: true,
          reasoningEffort: "low",
          reasoningSummary: "auto",
          store: false,
          include: ["reasoning.encrypted_content"],
        },
      },
    });

    const plan = normalizeControlPlan(await result.output);
    if (!plan) {
      return { ok: false, status: null, error: "The generated plan was incomplete. Please refine the request and try again." };
    }
    return { ok: true, plan };
  } catch (error) {
    return errorResult(error);
  }
}