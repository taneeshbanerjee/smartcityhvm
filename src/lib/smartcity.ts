export const ORG_NAME = "Hariyana Vidya Mandir";

export const NUS_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
export const NUS_WRITE = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
export const NUS_NOTIFY = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

export type SwitchKey = "SL" | "BL" | "GR" | "RD" | "WT";
export const SWITCH_KEYS: SwitchKey[] = ["SL", "BL", "GR", "RD", "WT"];

export interface CityState {
  SL: boolean; BL: boolean; GR: boolean; RD: boolean;
  /** Wind turbine: the ESP32 runs the one motor (L298N OUT1/OUT2) slowly, at 10% speed. */
  WT: boolean; AUTO: boolean;
  /** Party running: the phone plays the song and the ESP32 flashes the lights to its beat. */
  MU: boolean;
  /** Stage light show running on the ESP32. */
  SH: boolean;
  /** The ESP32's own decision: the light sensor sees dark (Auto turns the lights on). */
  DK: boolean;
  /** Light sensor reading, 0 (dark) to 4095 (bright). */
  LDR: number | null;
  /** Threshold setting on the ESP32: 0 = automatic (adjusts to the room), otherwise fixed. */
  THR: number | null;
  /** The lights come on when LDR falls below this reading. */
  LON: number | null;
}

export const initialState: CityState = {
  SL: false, BL: false, GR: false, RD: false, WT: false, AUTO: false, MU: false, SH: false, DK: false,
  LDR: null, THR: null, LON: null,
};

const FLAG_KEYS = ["AUTO", "MU", "SH", "DK"];
const NUMBER_KEYS = ["LDR", "THR", "LON"] as const;

/** Parse "ST:SL=1,BL=0,...,AUTO=1,MU=0,SH=0,DK=0;LDR=732,THR=0,LON=1440". Returns null if malformed. */
export function parseStatus(line: string): Partial<CityState> | null {
  const t = line.trim();
  if (!t.startsWith("ST:")) return null;
  const out: Partial<CityState> = {};
  const parts = t.slice(3).split(/[;,]/);
  let any = false;
  for (const p of parts) {
    const [k, v] = p.split("=");
    if (!k || v === undefined) continue;
    const key = k.trim().toUpperCase();
    const val = v.trim();
    if ((SWITCH_KEYS as string[]).includes(key) || FLAG_KEYS.includes(key)) {
      if (val !== "0" && val !== "1") continue;
      (out as Record<string, boolean>)[key] = val === "1";
      any = true;
    } else if ((NUMBER_KEYS as readonly string[]).includes(key)) {
      const n = Number(val);
      if (val === "" || !Number.isFinite(n)) continue;
      out[key as (typeof NUMBER_KEYS)[number]] = n;
      any = true;
    }
  }
  return any ? out : null;
}

export function formatStatus(s: CityState): string {
  const b = (x: boolean) => (x ? 1 : 0);
  return `ST:SL=${b(s.SL)},BL=${b(s.BL)},GR=${b(s.GR)},RD=${b(s.RD)},WT=${b(s.WT)},AUTO=${b(s.AUTO)},MU=${b(s.MU)},SH=${b(s.SH)},DK=${b(s.DK)};` +
    `LDR=${Math.round(s.LDR ?? 0)},THR=${Math.round(s.THR ?? 0)},LON=${Math.round(s.LON ?? 0)}`;
}

/** Map spoken phrase to commands. Returns null if not understood. */
export function parseVoice(text: string): { cmds: string[]; reply: string; show?: boolean } | null {
  const t = text.toLowerCase();
  const on = /\b(on|start|enable|switch on|turn on)\b/.test(t) && !/\b(off|stop)\b/.test(t);
  const off = /\b(off|stop|disable)\b/.test(t);
  if (/all off|everything off|switch off all|turn off all/.test(t)) return { cmds: ["ALL:0"], reply: "Turning everything off" };
  if (/show/.test(t) && /\b(stop|end|off)\b/.test(t)) return { cmds: ["SHOW:0"], reply: "Stopping the show" };
  if (/show/.test(t)) return { cmds: [], reply: "Starting show mode", show: true };
  for (const s of ["day", "night", "eco"]) if (t.includes(`${s} mode`) || t.includes(`${s} scene`)) return { cmds: [`SCENE:${s}`], reply: `${s} mode activated` };
  if (/auto/.test(t) && (on || off)) return { cmds: [`AUTO:${on ? 1 : 0}`], reply: `Auto mode ${on ? "on" : "off"}` };
  const map: [RegExp, SwitchKey, string][] = [
    [/street/, "SL", "street lights"],
    [/building/, "BL", "building lights"],
    [/green/, "GR", "green lights"],
    [/red|beacon/, "RD", "red beacons"],
    [/wind|turbine|fan/, "WT", "wind turbines"],
  ];
  for (const [re, k, name] of map) {
    if (re.test(t) && (on || off)) return { cmds: [`${k}:${on ? 1 : 0}`], reply: `${name} ${on ? "on" : "off"}` };
  }
  return null;
}
