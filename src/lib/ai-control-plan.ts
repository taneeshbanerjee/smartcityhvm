import type { CityState } from "@/lib/smartcity";

export const PLAN_DEVICE_KEYS = ["SL", "BL", "GR", "RD", "WT", "HT", "PM", "AUTO"] as const;
export type PlanDevice = (typeof PLAN_DEVICE_KEYS)[number];

export const PLAN_DEVICES: Record<PlanDevice, string> = {
  SL: "Street lights",
  BL: "Building lights",
  GR: "Green status lights",
  RD: "Red beacons",
  WT: "Wind turbine",
  HT: "Water turbine",
  PM: "Water pump",
  AUTO: "Automatic lighting",
};
export type PlanAction = { device: PlanDevice; enabled: boolean };
export type ControlPlan = {
  title: string;
  summary: string;
  powerImpact: "Low" | "Moderate" | "High";
  actions: PlanAction[];
};

export function normalizePlanDescription(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const description = value.trim();
  if (description.length === 0 || description.length > 1000) return null;
  return description;
}

export function normalizeControlPlan(value: unknown): ControlPlan | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate["title"] !== "string" || candidate["title"].trim().length < 3 || candidate["title"].length > 70 ||
    typeof candidate["summary"] !== "string" || candidate["summary"].trim().length < 10 || candidate["summary"].length > 300 ||
    !["Low", "Moderate", "High"].includes(String(candidate["powerImpact"])) ||
    !Array.isArray(candidate["actions"]) || candidate["actions"].length > PLAN_DEVICE_KEYS.length
  ) return null;

  const usedDevices = new Set<PlanDevice>();
  const actions: PlanAction[] = [];
  for (const item of candidate["actions"]) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const action = item as Record<string, unknown>;
    if (
      typeof action["device"] !== "string" || !PLAN_DEVICE_KEYS.includes(action["device"] as PlanDevice) ||
      typeof action["enabled"] !== "boolean" || usedDevices.has(action["device"] as PlanDevice)
    ) return null;
    usedDevices.add(action["device"] as PlanDevice);
    actions.push({ device: action["device"] as PlanDevice, enabled: action["enabled"] });
  }

  return {
    title: candidate["title"].trim(),
    summary: candidate["summary"].trim(),
    powerImpact: candidate["powerImpact"] as ControlPlan["powerImpact"],
    actions,
  };
}

export function planCommands(actions: PlanAction[]): string[] {
  return actions.map(({ device, enabled }) => `${device}:${enabled ? 1 : 0}`);
}

export function changedPlanActions(state: CityState, actions: PlanAction[]): PlanAction[] {
  return actions.filter(({ device, enabled }) => state[device] !== enabled);
}