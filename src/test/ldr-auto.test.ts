import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatStatus, initialState, parseStatus } from "@/lib/smartcity";
import { connectDemo } from "@/lib/transport";

describe("light sensor (LDR) and Auto mode", () => {
  afterEach(() => vi.useRealTimers());

  it("reads the firmware's status line: dark/light decision, threshold setting and switch-on level", () => {
    expect(parseStatus("ST:SL=1,BL=1,GR=0,RD=0,WT=0,AUTO=1,MU=0,SH=0,DK=1;LDR=732,THR=0,LON=1680")).toEqual({
      SL: true, BL: true, GR: false, RD: false, WT: false, AUTO: true, MU: false, SH: false, DK: true,
      LDR: 732, THR: 0, LON: 1680,
    });
    // older firmware without the new fields still parses
    expect(parseStatus("ST:SL=0,AUTO=0;LDR=900")).toEqual({ SL: false, AUTO: false, LDR: 900 });
    const s = { ...initialState, AUTO: true, DK: true, LDR: 500, THR: 1200, LON: 1100 };
    expect(parseStatus(formatStatus(s))).toMatchObject({ AUTO: true, DK: true, LDR: 500, THR: 1200, LON: 1100 });
  });

  it("firmware: Auto is on at power-up, follows the LDR both ways, and reports it", () => {
    const ino = readFileSync(resolve(process.cwd(), "public/esp32-code/HVM_SmartCity_ESP32.ino"), "utf8");
    expect(ino).toMatch(/bool autoMode = true;/);
    expect(ino).toMatch(/int thrManual = 0;/);
    // dark -> both street and building lights on, light -> both off
    expect(ino).toMatch(/setBit\(B_SL, ldrDark\);\s*setBit\(B_BL, ldrDark\);/);
    expect(ino).toContain('"ST:SL=%d,BL=%d,GR=%d,RD=%d,WT=%d,AUTO=%d,MU=%d,SH=%d,DK=%d;LDR=%d,THR=%d,LON=%d\\n"');
  });

  it("demo works like the firmware: Auto on at start, lights by hand turn it off, AUTO:1 turns it back on", async () => {
    vi.useFakeTimers();
    const lines: string[] = [];
    const demo = connectDemo({ onLine: (l) => { lines.push(l); }, onDisconnect: () => {}, onReconnected: () => {} });
    const last = () => parseStatus([...lines].reverse().find((l) => l.startsWith("ST:"))!)!;
    vi.advanceTimersByTime(200);
    expect(last()).toMatchObject({ AUTO: true, THR: 0 });

    await demo.send("SL:1"); vi.advanceTimersByTime(200);
    expect(last()).toMatchObject({ AUTO: false, SL: true });

    // a fixed threshold above the reading: dark, so Auto turns both lights on
    await demo.send("THR:4000"); await demo.send("AUTO:1"); vi.advanceTimersByTime(200);
    expect(last()).toMatchObject({ AUTO: true, THR: 4000, DK: true, SL: true, BL: true });

    // a fixed threshold below the reading: light, so Auto turns them off
    await demo.send("THR:5"); vi.advanceTimersByTime(200);
    expect(last()).toMatchObject({ AUTO: true, DK: false, SL: false, BL: false });
    demo.disconnect();
  });
});
