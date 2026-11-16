import { afterEach, describe, expect, it, vi } from "vitest";
import { composePartyMusicWithAI } from "@/lib/ai-party-music.server";

afterEach(() => { vi.unstubAllGlobals(); });

const reply = (text: string, status = 200) => new Response(status === 200 ? JSON.stringify({
  id: "resp_test", object: "response", created_at: 1_790_000_000, model: "test-model", status: "completed",
  output: [{ type: "message", id: "msg_test", role: "assistant", status: "completed", content: [{ type: "output_text", text, annotations: [] }] }],
  incomplete_details: null,
  usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } },
}) : text, { status, headers: { "content-type": "application/json" } });

describe("AI party music", () => {
  it("asks the Lovable AI Gateway for a melody and returns it ready for the buzzer", async () => {
    const fetchMock = vi.fn(async (_u: RequestInfo | URL, _i?: RequestInit) => reply(JSON.stringify({
      title: "Festival Lights", bpm: 128, notes: [{ pitch: 72, sixteenths: 4 }, { pitch: 76, sixteenths: 4 }, { pitch: 108, sixteenths: 4 }, { pitch: 0, sixteenths: 4 }],
    })));
    vi.stubGlobal("fetch", fetchMock);

    const result = await composePartyMusicWithAI("festival drums", "test-key");
    expect(result).toEqual({ ok: true, motif: { title: "Festival Lights", bpm: 128, notes: [
      { pitch: 72, sixteenths: 4 }, { pitch: 76, sixteenths: 4 }, { pitch: 96, sixteenths: 4 }, { pitch: 0, sixteenths: 4 },
    ] } });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://ai.gateway.lovable.dev/v1/responses");
    expect(new Headers(init?.headers).get("lovable-api-key")).toBe("test-key");
    expect(JSON.stringify(JSON.parse(String(init?.body)).input)).toContain("festival drums");
  });

  it("reports gateway errors with their message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(JSON.stringify({ error: { message: "Not enough credits." } }), 402)));
    await expect(composePartyMusicWithAI("", "test-key")).resolves.toEqual({ ok: false, status: 402, error: "Not enough credits." });
  });

  it("rejects a melody without any notes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(JSON.stringify({ title: "Silence", bpm: 120, notes: [{ pitch: 0, sixteenths: 4 }, { pitch: 0, sixteenths: 4 }, { pitch: 0, sixteenths: 4 }, { pitch: 0, sixteenths: 4 }] }))));
    expect((await composePartyMusicWithAI("", "test-key")).ok).toBe(false);
  });
});
