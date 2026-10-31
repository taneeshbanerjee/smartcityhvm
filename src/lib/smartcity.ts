export const ORG_NAME = "Hariyana Vidya Mandir";

export const NUS_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
export const NUS_WRITE = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
export const NUS_NOTIFY = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

export type SwitchKey = "SL" | "BL" | "GR" | "RD" | "WT" | "HT" | "PM";
export const SWITCH_KEYS: SwitchKey[] = ["SL", "BL", "GR", "RD", "WT", "HT", "PM"];

export interface CityState {
  SL: boolean; BL: boolean; GR: boolean; RD: boolean;
  WT: boolean; HT: boolean; PM: boolean; AUTO: boolean;
  LDR: number | null; SOL: number | null;
}

export const initialState: CityState = {
  SL: false, BL: false, GR: false, RD: false, WT: false, HT: false, PM: false, AUTO: false,
  LDR: null, SOL: null,
};

/** Parse "ST:SL=1,BL=0,...,AUTO=1;LDR=732;SOL=4.62". Returns null if malformed. */
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
    if ((SWITCH_KEYS as string[]).includes(key) || key === "AUTO") {
      if (val !== "0" && val !== "1") continue;
      (out as Record<string, boolean>)[key] = val === "1";
      any = true;
    } else if (key === "LDR" || key === "SOL") {
      const n = Number(val);
      if (!Number.isFinite(n)) continue;
      out[key] = n;
      any = true;
    }
  }
  return any ? out : null;
}

export function formatStatus(s: CityState): string {
  const b = (x: boolean) => (x ? 1 : 0);
  return `ST:SL=${b(s.SL)},BL=${b(s.BL)},GR=${b(s.GR)},RD=${b(s.RD)},WT=${b(s.WT)},HT=${b(s.HT)},PM=${b(s.PM)},AUTO=${b(s.AUTO)};LDR=${Math.round(s.LDR ?? 0)};SOL=${(s.SOL ?? 0).toFixed(2)}`;
}

/** Map spoken phrase to commands. Returns null if not understood. */
export function parseVoice(text: string): { cmds: string[]; reply: string; show?: boolean } | null {
  const t = text.toLowerCase();
  const on = /\b(on|start|enable|switch on|turn on)\b/.test(t) && !/\b(off|stop)\b/.test(t);
  const off = /\b(off|stop|disable)\b/.test(t);
  if (/all off|everything off|switch off all|turn off all/.test(t)) return { cmds: ["ALL:0"], reply: "Turning everything off" };
  if (/show/.test(t)) return { cmds: [], reply: "Starting show mode", show: true };
  for (const s of ["day", "night", "eco"]) if (t.includes(`${s} mode`) || t.includes(`${s} scene`)) return { cmds: [`SCENE:${s}`], reply: `${s} mode activated` };
  if (/auto/.test(t) && (on || off)) return { cmds: [`AUTO:${on ? 1 : 0}`], reply: `Auto mode ${on ? "on" : "off"}` };
  const map: [RegExp, SwitchKey, string][] = [
    [/street/, "SL", "street lights"],
    [/building/, "BL", "building lights"],
    [/green/, "GR", "green lights"],
    [/red|beacon/, "RD", "red beacons"],
    [/wind/, "WT", "wind turbine"],
    [/water turbine|hydro/, "HT", "water turbine"],
    [/pump/, "PM", "water pump"],
  ];
  for (const [re, k, name] of map) {
    if (re.test(t) && (on || off)) return { cmds: [`${k}:${on ? 1 : 0}`], reply: `${name} ${on ? "on" : "off"}` };
  }
  return null;
}
