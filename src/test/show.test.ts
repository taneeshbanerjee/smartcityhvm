import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PATTERN_STEPS, SHOW_BPM, SHOW_PATTERNS, SHOW_STEP_MS, SHOW_STEPS } from "@/lib/show";
import { parseStatus, parseVoice } from "@/lib/smartcity";
import { connectDemo } from "@/lib/transport";

afterEach(() => { vi.useRealTimers(); });

describe("stage light show", () => {
  it("matches the 100-pattern table in the ESP32 firmware exactly", () => {
    const ino = readFileSync(resolve(process.cwd(), "public/esp32-code/HVM_SmartCity_ESP32.ino"), "utf8");
    const start = ino.indexOf("const uint8_t SHOW_STEPS[] = {");
    const table = ino.slice(ino.indexOf("{", start) + 1, ino.indexOf("};", start));
    const firmware = table.split("\n").map((l) => l.replace(/\/\/.*$/, "")).join(" ").split(",").map((t) => t.trim()).filter(Boolean).map(Number);
    expect(firmware).toEqual(SHOW_STEPS);
    expect(ino).toContain(`const uint16_t SHOW_BPM = ${SHOW_BPM};`);
    expect(ino).toContain(`const uint8_t PATTERN_STEPS = ${PATTERN_STEPS};`);
    expect(SHOW_PATTERNS).toHaveLength(100);
    expect(SHOW_PATTERNS.every((p) => p.steps.length === PATTERN_STEPS && p.steps.every((v) => v >= 0 && v <= 15))).toBe(true);
    expect(new Set(SHOW_PATTERNS.map((p) => p.steps.join())).size).toBe(100);   // all different
    expect(SHOW_STEP_MS).toBe(234);
  });

  it("runs in demo mode at the show tempo with turbines on, and stopping restores the city", async () => {
    vi.useFakeTimers();
    const lines: string[] = [];
    const demo = connectDemo({ onLine: (l) => { lines.push(l); }, onDisconnect: () => {}, onReconnected: () => {} });
    const last = () => parseStatus([...lines].reverse().find((l) => l.startsWith("ST:"))!)!;
    await demo.send("SL:1"); await demo.send("GR:1"); vi.advanceTimersByTime(200);
    await demo.send("SCENE:show");
    const frames: string[] = [];
    for (let i = 0; i < 16; i++) { vi.advanceTimersByTime(SHOW_STEP_MS); const st = last(); expect(st).toMatchObject({ SH: true, WT: true }); frames.push(`${+st.SL!}${+st.BL!}${+st.GR!}${+st.RD!}`); }
    expect(frames.slice(0, 4)).toEqual(["0100", "0010", "0001", "1000"]);   // the chase, one step every half beat
    await demo.send("SHOW:0"); vi.advanceTimersByTime(200);
    expect(last()).toMatchObject({ SH: false, SL: true, GR: true, BL: false, RD: false, WT: false });
    await demo.send("SCENE:show"); vi.advanceTimersByTime(1000);
    await demo.send("SCENE:night"); vi.advanceTimersByTime(200);
    expect(last()).toMatchObject({ SH: false, SL: true, BL: true, GR: false, RD: true, WT: true });
    demo.disconnect();
  });

  it("starts and stops by voice", () => {
    expect(parseVoice("start the show")).toMatchObject({ show: true });
    expect(parseVoice("stop the show")?.cmds).toEqual(["SHOW:0"]);
  });
});
