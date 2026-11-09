import { describe, expect, it } from "vitest";
import { changedPlanActions, normalizeControlPlan, planCommands, type ControlPlan } from "@/lib/ai-control-plan";
import { initialState } from "@/lib/smartcity";

const validPlan: ControlPlan = {
  title: "Evening campus",
  summary: "Switch on the requested lights for an evening campus event.",
  powerImpact: "Moderate",
  actions: [{ device: "SL", enabled: true }, { device: "BL", enabled: true }],
};

describe("AI control plan validation", () => {
  it("accepts only supported devices and translates them to the device protocol", () => {
    expect(normalizeControlPlan(validPlan)).toEqual(validPlan);
    expect(planCommands(validPlan.actions)).toEqual(["SL:1", "BL:1"]);
  });

  it("rejects unsupported device commands and duplicate device actions", () => {
    expect(normalizeControlPlan({ ...validPlan, actions: [{ device: "RESET", enabled: true }] })).toBeNull();
    expect(normalizeControlPlan({ ...validPlan, actions: [{ device: "SL", enabled: true }, { device: "SL", enabled: false }] })).toBeNull();
  });

  it("shows only actions that differ from reported device state", () => {
    expect(changedPlanActions({ ...initialState, SL: true }, validPlan.actions)).toEqual([
      { device: "BL", enabled: true },
    ]);
  });

  it("rejects oversized descriptions before sending them to the model", () => {
    expect("x".repeat(1001).length).toBe(1001);
  });
});