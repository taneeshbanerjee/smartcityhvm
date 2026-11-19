import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SHOW_BPM, SHOW_PATTERNS, SHOW_STEP_MS, SHOW_STEPS } from "@/lib/show";
import { parseStatus, parseVoice } from "@/lib/smartcity";
import { connectDemo } from "@/lib/transport";

afterEach(() => { vi.useRealTimers(); });

describe("stage light show", () => {
  it("matches the show table in the ESP32 firmware exactly", () => {
    const ino = readFileSync(resolve(process.cwd(), "public/esp32-code/HVM_SmartCity_ESP32.ino"), "utf8");
    const table = ino.slice(ino.indexOf("const uint8_t SHOW_STEPS[] = {"), ino.indexOf("};", ino.indexOf("const uint8_t SHOW_STEPS[] = {")));
    const bits: Record<string, number> = { W_: 1, Y_: 2, G_: 4, R_: 8, A_: 15, "0": 0 };
    const firmware = table.slice(table.indexOf("{") + 1).split("\n").map((l) => l.replace(/\/\/.*$/, "")).join(" ")
      .split(",").map((t) => t.trim()).filter(Boolean)
      .map((t) => t.split("|").reduce((m, p) => m | bits[p.trim()]!, 0));
    expect(firmware).toEqual(SHOW_STEPS);
    expect(ino).toContain(`const uint16_t SHOW_BPM = ${SHOW_BPM};`);
    expect(SHOW_PATTERNS).toHaveLength(10);
    expect(SHOW_PATTERNS.every((p) => p.steps.length === 16)).toBe(true);
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
