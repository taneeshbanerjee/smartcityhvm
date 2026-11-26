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

  it("follows the tune: a lit step for every note, dark on rests, a blink at the end of each note", async () => {
    const { SHOW_STEPS } = await import("@/lib/show");
    const song = buildMinuteSong(composeBuiltInMotif(42), "built-in");
    const { demo, last } = await partyDemo([]);
    const sixteenth = 15000 / song.bpm;
    const lit = () => { const st = last(); return +st.SL! | (+st.BL! << 1) | (+st.GR! << 2) | (+st.RD! << 3); };
    const firstBar: number[] = [];
    let six = 0;
    for (const note of song.notes.slice(0, 24)) {
      vi.advanceTimersByTime(1);
      const mask = lit();
      if (note.pitch > 0) expect(mask).not.toBe(0); else expect(mask).toBe(0);
      if (note.pitch > 0 && six < 16) firstBar.push(mask);
      vi.advanceTimersByTime(note.sixteenths * sixteenth * 0.9 - 1);
      expect(lit()).toBe(0);   // the blink at the end of the note
      vi.advanceTimersByTime(note.sixteenths * sixteenth * 0.1);
      six += note.sixteenths;
    }
    // the first bar's notes walk through pattern 1's lit steps in order
    expect(firstBar).toEqual(SHOW_STEPS.slice(0, 8).filter(Boolean).slice(0, firstBar.length));
    demo.disconnect();
  });
});
