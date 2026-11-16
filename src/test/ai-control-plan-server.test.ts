import { afterEach, describe, expect, it, vi } from "vitest";
import { generateControlPlanWithAI } from "@/lib/ai-control-plan.server";

afterEach(() => { vi.unstubAllGlobals(); });

function gatewayReply(text: string) {
  return new Response(JSON.stringify({
    id: "resp_test",
    object: "response",
    created_at: 1_790_000_000,
    model: "test-model",
    status: "completed",
    output: [{
      type: "message",
      id: "msg_test",
      role: "assistant",
      status: "completed",
      content: [{ type: "output_text", text, annotations: [] }],
    }],
    incomplete_details: null,
    usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

describe("AI Gateway control plan generation", () => {
  it("calls the Lovable AI Gateway and returns a validated plan", async () => {
    const plan = {
      title: "Evening assembly",
      summary: "Street and building lights on with the wind turbine running.",
      powerImpact: "Moderate",
      actions: [{ device: "SL", enabled: true }, { device: "BL", enabled: true }, { device: "WT", enabled: true }],
    };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => gatewayReply(JSON.stringify(plan)));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateControlPlanWithAI("Evening assembly lights", "test-key")).resolves.toEqual({ ok: true, plan });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://ai.gateway.lovable.dev/v1/responses");
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe("Bearer test-key");
    expect(headers.get("lovable-api-key")).toBe("test-key");
    const body = JSON.parse(String(init?.body));
    expect(body.text.format).toMatchObject({ type: "json_schema", strict: true });
    expect(JSON.stringify(body.input)).toContain("Evening assembly lights");
  });

  it("keeps the gateway status and message for rate limits", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ error: { message: "Rate limited, slow down." } }),
      { status: 429, headers: { "content-type": "application/json" } },
    )));

    await expect(generateControlPlanWithAI("Night mode", "test-key")).resolves.toEqual({
      ok: false, status: 429, error: "Rate limited, slow down.",
    });
  });

  it("rejects model output with devices the city doesn't have", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => gatewayReply(JSON.stringify({
      title: "Pump plan", summary: "Turn on the water pump for the garden.", powerImpact: "Low",
      actions: [{ device: "PM", enabled: true }],
    }))));

    const result = await generateControlPlanWithAI("Pump on", "test-key");
    expect(result.ok).toBe(false);
  });
});
