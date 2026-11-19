import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMinuteSong, composeBuiltInMotif, songCommands } from "@/lib/party-music";
import { parseStatus } from "@/lib/smartcity";
import { connectDemo } from "@/lib/transport";

afterEach(() => { vi.useRealTimers(); });

async function partyDemo(setup: string[]) {
  vi.useFakeTimers();
  const lines: string[] = [];
  const demo = connectDemo({ onLine: (l) => { lines.push(l); }, onDisconnect: () => {}, onReconnected: () => {} });
  for (const c of setup) await demo.send(c);
  for (const c of songCommands(buildMinuteSong(composeBuiltInMotif(42), "built-in"))) await demo.send(c);
  const last = () => parseStatus([...lines].reverse().find((l) => l.startsWith("ST:"))!)!;
  return { demo, last };
}

describe("demo mode party", () => {
  it("flashes the lights for one minute, then restores the city exactly", async () => {
    const { demo, last } = await partyDemo(["SL:1", "GR:1"]);
    vi.advanceTimersByTime(10_000);
    expect(last()).toMatchObject({ MU: true, WT: true, AUTO: false });
    vi.advanceTimersByTime(52_000);
    expect(last()).toMatchObject({ MU: false, SL: true, BL: false, GR: true, RD: false, WT: false, AUTO: false });
    demo.disconnect();
  });

  it("turns Auto mode back on afterwards if it was on", async () => {
    const { demo, last } = await partyDemo(["AUTO:1"]);
    vi.advanceTimersByTime(5_000);
    expect(last()).toMatchObject({ MU: true, AUTO: false });
    vi.advanceTimersByTime(57_000);
    expect(last()).toMatchObject({ MU: false, AUTO: true });
    demo.disconnect();
  });

  it("steps the lights through the show patterns on every half beat of the song", async () => {
    const { SHOW_STEPS, showLights } = await import("@/lib/show");
    const { demo, last } = await partyDemo([]);
    const step = 30000 / composeBuiltInMotif(42).bpm;   // half a beat at the song's own tempo
    const seen: string[] = [];
    for (let i = 0; i < 8; i++) { const st = last(); seen.push(`${+st.SL!}${+st.BL!}${+st.GR!}${+st.RD!}`); vi.advanceTimersByTime(step); }
    const want = SHOW_STEPS.slice(0, 8).map((m) => { const l = showLights(m); return `${+l.SL}${+l.BL}${+l.GR}${+l.RD}`; });
    expect(seen).toEqual(want);
    demo.disconnect();
  });
});
