import { afterEach, describe, expect, it, vi } from "vitest";
import { writeSunoPromptWithAI } from "@/lib/ai-suno-prompt.server";
import { fallbackSunoPrompt, normalizeSunoPrompt, SUNO_PROMPT_MAX } from "@/lib/suno-prompt";

afterEach(() => { vi.unstubAllGlobals(); });

const reply = (text: string) => new Response(JSON.stringify({
  id: "resp_test", object: "response", created_at: 1_790_000_000, model: "test-model", status: "completed",
  output: [{ type: "message", id: "msg_test", role: "assistant", status: "completed", content: [{ type: "output_text", text, annotations: [] }] }],
  incomplete_details: null,
  usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } },
}), { status: 200, headers: { "content-type": "application/json" } });

describe("Suno prompt", () => {
  it("strips anything lyric-like and keeps one line within Suno's limit", () => {
    const p = normalizeSunoPrompt('Bollywood dance pop, 128 bpm\n[Verse]\n"Lights up the city tonight"\n(ooh) dhol, synths, female vocals');
    expect(p).toBe("Bollywood dance pop, 128 bpm, dhol, synths, female vocals");
    const long = normalizeSunoPrompt("energetic synthwave, ".repeat(30))!;
    expect(long.length).toBeLessThanOrEqual(SUNO_PROMPT_MAX);
    expect(normalizeSunoPrompt("[Chorus]")).toBeNull();
  });

  it("writes a prompt from the mood when AI isn't available", () => {
    const p = fallbackSunoPrompt('festival drums\n"no lyrics please"');
    expect(p.startsWith("festival drums")).toBe(true);
    expect(p).not.toMatch(/[\n[\]"]/);
    expect(p.length).toBeLessThanOrEqual(SUNO_PROMPT_MAX);
    expect(fallbackSunoPrompt("").length).toBeGreaterThan(20);
  });

  it("asks Lovable AI for a lyrics-free prompt based on the mood", async () => {
    const fetchMock = vi.fn(async (_u: RequestInfo | URL, _i?: RequestInit) => reply(JSON.stringify({
      prompt: "Upbeat Bollywood dance pop, 126 bpm, dhol and tabla, bright synths, energetic male and female vocals, festive celebration",
    })));
    vi.stubGlobal("fetch", fetchMock);

    const result = await writeSunoPromptWithAI("bollywood dance", "test-key");
    expect(result).toEqual({ ok: true, prompt: "Upbeat Bollywood dance pop, 126 bpm, dhol and tabla, bright synths, energetic male and female vocals, festive celebration" });
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body));
    expect(JSON.stringify(body)).toContain("Never include lyrics");
    expect(JSON.stringify(body.input)).toContain("bollywood dance");
  });
});
