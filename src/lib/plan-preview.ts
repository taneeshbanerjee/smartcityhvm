import type { PlanAction } from "@/lib/ai-control-plan";
import type { CityState, SwitchKey } from "@/lib/smartcity";

export type PreviewDevices = Record<SwitchKey, boolean>;

/** The device states the city would have after applying the plan to its reported state. */
export function planPreviewDevices(state: CityState, actions: PlanAction[]): PreviewDevices {
  const devices: PreviewDevices = { SL: state.SL, BL: state.BL, GR: state.GR, RD: state.RD, WT: state.WT, HT: state.HT };
  for (const { device, enabled } of actions) if (device !== "AUTO") devices[device] = enabled;
  return devices;
}

/** Lights only show after dark, so preview at night whenever the plan leaves any light on. */
export function planPreviewTheme(devices: PreviewDevices): "night" | "day" {
  return devices.SL || devices.BL || devices.RD ? "night" : "day";
}
