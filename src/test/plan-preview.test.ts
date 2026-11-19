import { describe, expect, it } from "vitest";
import { planPreviewDevices, planPreviewTheme } from "@/lib/plan-preview";
import { initialState } from "@/lib/smartcity";

describe("plan city preview", () => {
  it("applies the plan's actions on top of the reported city state", () => {
    const devices = planPreviewDevices({ ...initialState, WT: true }, [
      { device: "SL", enabled: true }, { device: "WT", enabled: false }, { device: "AUTO", enabled: true },
    ]);
    expect(devices).toEqual({ SL: true, BL: false, GR: false, RD: false, WT: false });
  });

  it("previews at night when any light stays on, otherwise in daylight", () => {
    const off = { SL: false, BL: false, GR: true, RD: false, WT: true };
    expect(planPreviewTheme(off)).toBe("day");
    expect(planPreviewTheme({ ...off, RD: true })).toBe("night");
  });
});
