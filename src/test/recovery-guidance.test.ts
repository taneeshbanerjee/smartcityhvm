import { describe, expect, it } from "vitest";
import { getRecoverySteps } from "@/lib/recovery-guidance";

describe("Bluetooth recovery guidance", () => {
  it("directs unsupported browsers to a supported browser and demo mode", () => {
    const steps = getRecoverySteps(false, "disconnected", false);
    expect(steps.join(" ")).toContain("Chrome or Edge");
    expect(steps.join(" ")).toContain("Demo mode");
  });

  it("suggests show-all pairing when the device picker finds no device", () => {
    const steps = getRecoverySteps(true, "disconnected", false, {
      time: "10:00", stage: "Choosing device", name: "NotFoundError", message: "No device found",
    });
    expect(steps.join(" ")).toContain("Show all devices");
    expect(steps.join(" ")).toContain("ESP32 powered");
  });

  it("asks for the advertised Nordic UART service when service discovery fails", () => {
    const steps = getRecoverySteps(true, "disconnected", false, {
      time: "10:00", stage: "Finding NUS service", name: "NotFoundError", message: "Service missing",
    });
    expect(steps.join(" ")).toContain("service UUID");
  });
});