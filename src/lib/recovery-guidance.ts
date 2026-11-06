import type { TransportDiagnostics, TransportError } from "@/lib/transport";
import { NUS_NOTIFY, NUS_SERVICE, NUS_WRITE } from "@/lib/smartcity";

export function buildDiagnosticsReport({
  generatedAt,
  supported,
  connection,
  device,
  diagnostics,
  errors,
  recentReplies,
  recoverySteps,
}: {
  generatedAt: string;
  supported: boolean;
  connection: string;
  device: string;
  diagnostics: TransportDiagnostics;
  errors: TransportError[];
  recentReplies: { text: string; time: string }[];
  recoverySteps: string[];
}): string {
  const lines = [
    "SmartCity Control — Bluetooth Troubleshooting Report",
    `Generated: ${generatedAt}`,
    "",
    "BLUETOOTH STATUS",
    `Web Bluetooth: ${supported ? "Supported" : "Not supported"}`,
    `Connection: ${connection}`,
    `Device: ${device || "None selected"}`,
    `Transport stage: ${diagnostics.stage}`,
    "",
    "NORDIC UART AVAILABILITY",
    `Service (${NUS_SERVICE}): ${diagnostics.service}`,
    `Write characteristic (${NUS_WRITE}): ${diagnostics.write}`,
    `Notify characteristic (${NUS_NOTIFY}): ${diagnostics.notify}`,
    `Notifications: ${diagnostics.notifications}`,
    "",
    "RECENT ESP32 REPLIES",
    ...(recentReplies.length
      ? recentReplies.map(({ time, text }) => `[${time}] ${text}`)
      : ["No device replies received this session."]),
    "",
    "RECENT TRANSPORT ERRORS",
    ...(errors.length
      ? errors.map(({ time, stage, name, message }) => `[${time}] ${stage} — ${name}: ${message}`)
      : ["No transport errors recorded."]),
    "",
    "RECOVERY STEPS",
    ...recoverySteps.map((step, index) => `${index + 1}. ${step}`),
    "",
  ];
  return lines.join("\n");
}

export function getRecoverySteps(
  supported: boolean,
  connection: string,
  demo: boolean,
  latestError?: TransportError,
): string[] {
  if (!supported) {
    return [
      "Open this app in Chrome or Edge on Android or desktop over HTTPS; Safari on iPhone and Firefox do not provide Web Bluetooth.",
      "Use Demo mode here, or switch to a supported browser to pair the ESP32.",
    ];
  }

  if (demo)
    return [
      "Demo mode is simulated; connect to the powered ESP32 to check real Bluetooth services and replies.",
    ];

  if (latestError?.name === "BluetoothOff") {
    return [
      "Turn on Bluetooth in your device settings, keep the ESP32 powered and nearby, then connect again.",
    ];
  }
  if (latestError?.name === "NotAllowedError" || latestError?.name === "SecurityError") {
    return [
      "Allow Bluetooth or nearby-device access for this site in browser settings, reload the page, then connect again.",
    ];
  }
  if (latestError?.stage === "Choosing device" && latestError.name === "NotFoundError") {
    return [
      "Keep the ESP32 powered and nearby, then choose Show all devices if it is not listed as HVM-SmartCity.",
    ];
  }
  if (latestError?.stage === "Finding NUS service") {
    return [
      "The ESP32 did not expose the Nordic UART service; check that its firmware uses the service UUID shown above.",
    ];
  }
  if (
    latestError?.stage === "Finding write characteristic" ||
    latestError?.stage === "Finding notify characteristic"
  ) {
    return [
      "Check the ESP32 firmware exposes both Nordic UART write and notify characteristics, then disconnect and pair again.",
    ];
  }
  if (latestError?.stage === "Connection lost" || connection === "connecting") {
    return [
      "Move the phone closer, keep the ESP32 powered, and wait for the automatic retry before pairing again.",
    ];
  }
  if (connection === "connected") {
    return [
      "Use Request status to ask the ESP32 for a fresh reply; confirm notifications are enabled in the firmware.",
    ];
  }
  return ["Turn on Bluetooth, power the ESP32, keep it nearby, and connect from this secure page."];
}
