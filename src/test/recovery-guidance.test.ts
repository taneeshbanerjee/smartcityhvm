import { describe, expect, it } from "vitest";
import { buildDiagnosticsReport, getRecoverySteps } from "@/lib/recovery-guidance";

describe("Bluetooth recovery guidance", () => {
  it("directs unsupported browsers to a supported browser and demo mode", () => {
    const steps = getRecoverySteps(false, "disconnected", false);
    expect(steps.join(" ")).toContain("Chrome or Edge");
    expect(steps.join(" ")).toContain("Demo mode");
  });

  it("suggests show-all pairing when the device picker finds no device", () => {
    const steps = getRecoverySteps(true, "disconnected", false, {
      time: "10:00",
      stage: "Choosing device",
      name: "NotFoundError",
      message: "No device found",
    });
    expect(steps.join(" ")).toContain("Show all devices");
    expect(steps.join(" ")).toContain("ESP32 powered");
  });

  it("asks for the advertised Nordic UART service when service discovery fails", () => {
    const steps = getRecoverySteps(true, "disconnected", false, {
      time: "10:00",
      stage: "Finding NUS service",
      name: "NotFoundError",
      message: "Service missing",
    });
    expect(steps.join(" ")).toContain("service UUID");
  });
});

describe("Bluetooth troubleshooting report", () => {
  it("includes current Bluetooth checks, ESP32 replies, errors, and recovery steps", () => {
    const report = buildDiagnosticsReport({
      generatedAt: "2026-11-06 20:30",
      supported: true,
      connection: "Connected",
      device: "HVM-SmartCity",
      diagnostics: {
        stage: "Ready",
        service: "available",
        write: "available",
        notify: "available",
        notifications: "available",
      },
      errors: [
        { time: "20:29", stage: "Sending SL:1", name: "NetworkError", message: "Write failed" },
      ],
      recentReplies: [{ time: "20:28", text: "ST:SL=1;LDR=732;SOL=4.62" }],
      recoverySteps: ["Use Request status to ask the ESP32 for a fresh reply."],
    });

    expect(report).toContain("Web Bluetooth: Supported");
    expect(report).toContain("Service (6e400001-b5a3-f393-e0a9-e50e24dcca9e): available");
    expect(report).toContain("Write characteristic (6e400002-b5a3-f393-e0a9-e50e24dcca9e): available");
    expect(report).toContain("Notify characteristic (6e400003-b5a3-f393-e0a9-e50e24dcca9e): available");
    expect(report).toContain("[20:28] ST:SL=1;LDR=732;SOL=4.62");
    expect(report).toContain("[20:29] Sending SL:1 — NetworkError: Write failed");
    expect(report).toContain("1. Use Request status to ask the ESP32 for a fresh reply.");
  });
});
