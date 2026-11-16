import { createOpenAI } from "@ai-sdk/openai";
import { createLovableAiGatewayRunIdFetch } from "@/lib/ai-control-plan-run-id.server";

/** Lovable AI Gateway model used for the dashboard's AI features. */
export const GATEWAY_MODEL = "openai/gpt-6-astra";

/** Shared provider options: low reasoning effort, nothing stored. */
export const GATEWAY_PROVIDER_OPTIONS = {
  openai: {
    forceReasoning: true,
    reasoningEffort: "low",
    reasoningSummary: "auto",
    store: false,
    include: ["reasoning.encrypted_content"],
  },
};

export type GatewayFailure = { ok: false; error: string; status: number | null };

export function createGatewayModel(apiKey: string) {
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
  return provider.responses(GATEWAY_MODEL);
}

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
        if (nested && typeof nested === "object") {
          const nestedMessage = (nested as Record<string, unknown>)["message"];
          if (typeof nestedMessage === "string") return nestedMessage;
        }
      }
    } catch {
      return null;
    }
  }
  return null;
}

/** Turn a gateway error into a safe message for operators, keeping the HTTP status. */
export function gatewayErrorResult(error: unknown, fallback: string): GatewayFailure {
  const status = readStatus(error);
  const upstreamMessage = readSafeMessage(error);
  if (status === 401) {
    return { ok: false, status, error: upstreamMessage ?? "Secure AI access needs to be configured for this workspace." };
  }
  if (status === 402 || status === 403) {
    return { ok: false, status, error: upstreamMessage ?? "AI generation is currently blocked for this workspace." };
  }
  if (status === 429) {
    return { ok: false, status, error: upstreamMessage ?? "The AI service is busy. Please try again later." };
  }
  if (status !== null && status >= 500) {
    return { ok: false, status, error: upstreamMessage ?? "The AI service is temporarily unavailable. Please try again later." };
  }
  return { ok: false, status, error: upstreamMessage ?? fallback };
}
