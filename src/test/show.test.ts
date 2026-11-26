import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PATTERN_STEPS, SHOW_BPM, SHOW_PATTERNS, SHOW_STEP_MS, SHOW_STEPS } from "@/lib/show";
import { parseStatus, parseVoice } from "@/lib/smartcity";
import { connectDemo } from "@/lib/transport";

afterEach(() => { vi.useRealTimers(); });

describe("stage light show", () => {
  it("matches the 1000-pattern table in the ESP32 firmware exactly, all patterns different", () => {
    const ino = readFileSync(resolve(process.cwd(), "public/esp32-code/HVM_SmartCity_ESP32.ino"), "utf8");
    const start = ino.indexOf("const uint8_t SHOW_STEPS[] = {");
    const table = ino.slice(ino.indexOf("{", start) + 1, ino.indexOf("};", start));
    const firmware = table.split("\n").map((l) => l.replace(/\/\/.*$/, "")).join(" ").split(",").map((t) => t.trim()).filter(Boolean).map(Number);
    expect(firmware).toEqual(SHOW_STEPS);
    expect(ino).toContain(`const uint16_t SHOW_BPM = ${SHOW_BPM};`);
    expect(ino).toContain(`const uint8_t PATTERN_STEPS = ${PATTERN_STEPS};`);
    expect(SHOW_PATTERNS).toHaveLength(1000);
    expect(SHOW_PATTERNS.every((p) => p.steps.length === PATTERN_STEPS && p.steps.every((v) => v >= 0 && v <= 15))).toBe(true);
    expect(new Set(SHOW_PATTERNS.map((p) => p.steps.join())).size).toBe(1000);   // all different
    expect(SHOW_PATTERNS.every((p) => p.steps.filter(Boolean).length >= 2)).toBe(true);   // every bar lights up
    expect(ino).toContain("const uint16_t PATTERN_COUNT = SHOW_LEN / PATTERN_STEPS;   // 1000");
    expect(SHOW_STEP_MS).toBe(234);
  });

  it("makes 1 lakh different variations, worked out the same way as the firmware", async () => {
    const { VARIATION_COUNT, TRANSFORMS, LIGHT_ORDERS, variationSteps } = await import("@/lib/show");
    const ino = readFileSync(resolve(process.cwd(), "public/esp32-code/HVM_SmartCity_ESP32.ino"), "utf8");
    expect(VARIATION_COUNT).toBe(100_000);
    expect(ino).toContain("const uint32_t VARIATION_COUNT = 100000;");
    expect(ino).toContain(`const uint16_t TRANSFORMS = ${TRANSFORMS};`);
    const orders = ino.slice(ino.indexOf("LIGHT_ORDERS[24][4] = {"), ino.indexOf("};", ino.indexOf("LIGHT_ORDERS[24][4] = {")));
    expect([...orders.matchAll(/\{(\d+), (\d+), (\d+), (\d+)\}/g)].map((m) => m.slice(1).map(Number))).toEqual(LIGHT_ORDERS);
    const all = Array.from({ length: VARIATION_COUNT }, (_, n) => variationSteps(n));
    expect(new Set(all.map((v) => v.join())).size).toBe(VARIATION_COUNT);   // all different
    expect(all.slice(0, 1000).map((v) => v.join())).toEqual(SHOW_PATTERNS.map((p) => p.steps.join()));
    expect(all.every((v) => v.length === 8 && v.filter(Boolean).length >= 2)).toBe(true);
    expect(variationSteps(VARIATION_COUNT)).toEqual(all[0]);   // starts again after 1 lakh
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
