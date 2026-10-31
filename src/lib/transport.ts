import { NUS_NOTIFY, NUS_SERVICE, NUS_WRITE, formatStatus, initialState, type CityState } from "./smartcity";

export interface Transport {
  send(cmd: string): Promise<void>;
  disconnect(): void;
  name: string;
}

export type Availability = "not checked" | "checking" | "available" | "unavailable" | "disconnected" | "simulated";
export interface TransportDiagnostics {
  stage: string;
  service: Availability;
  write: Availability;
  notify: Availability;
  notifications: Availability;
}
export const initialDiagnostics: TransportDiagnostics = {
  stage: "Idle", service: "not checked", write: "not checked", notify: "not checked", notifications: "not checked",
};
export interface TransportError { time: string; stage: string; name: string; message: string }

interface Handlers {
  onLine: (line: string) => void;
  onDisconnect: (reconnecting: boolean) => void;
  onReconnected: () => void;
  onDiagnostics?: (diagnostics: TransportDiagnostics) => void;
  onError?: (error: TransportError) => void;
}

function reportError(h: Handlers, stage: string, error: unknown) {
  h.onError?.({ time: new Date().toLocaleTimeString(), stage,
    name: error instanceof Error ? error.name : "TransportError",
    message: error instanceof Error ? error.message : String(error) });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function isBleSupported() {
  return typeof navigator !== "undefined" && !!(navigator as any).bluetooth;
}

export async function connectBle(showAll: boolean, h: Handlers): Promise<Transport> {
  let diagnostics = { ...initialDiagnostics };
  const update = (patch: Partial<TransportDiagnostics>) => {
    diagnostics = { ...diagnostics, ...patch };
    h.onDiagnostics?.(diagnostics);
  };
  const bt = (navigator as any).bluetooth;
  let device: any;
  try {
  update({ stage: "Checking Bluetooth" });
  if (!bt) throw new Error("Web Bluetooth is not supported in this browser");
  if (bt.getAvailability && !(await bt.getAvailability())) {
    const e = new Error("Bluetooth is turned off or unavailable");
    e.name = "BluetoothOff";
    throw e;
  }
  update({ stage: "Choosing device" });
  device = await bt.requestDevice(
    showAll
      ? { acceptAllDevices: true, optionalServices: [NUS_SERVICE] }
      : { filters: [{ namePrefix: "HVM-SmartCity" }, { services: [NUS_SERVICE] }], optionalServices: [NUS_SERVICE] },
  );
  } catch (error) {
    reportError(h, diagnostics.stage, error);
    update({ stage: "Pairing failed" });
    throw error;
  }

  let writeChar: any = null;
  let manual = false;
  let buffer = "";
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let queue: Promise<void> = Promise.resolve();
  let notifyChar: any = null;

  const onNotify = (ev: any) => {
    buffer += decoder.decode(ev.target.value as DataView);
    let i;
    while ((i = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, i).replace(/\r$/, "");
      buffer = buffer.slice(i + 1);
      if (line.trim()) h.onLine(line);
    }
    if (buffer.length > 1024) buffer = "";
  };

  const setup = async () => {
    buffer = "";
    notifyChar?.removeEventListener("characteristicvaluechanged", onNotify);
    notifyChar = null;
    update({ ...initialDiagnostics, stage: "Connecting GATT" });
    const server = await device.gatt.connect();
    update({ stage: "Finding NUS service", service: "checking" });
    const svc = await server.getPrimaryService(NUS_SERVICE);
    update({ stage: "Finding write characteristic", service: "available", write: "checking" });
    writeChar = await svc.getCharacteristic(NUS_WRITE);
    update({ stage: "Finding notify characteristic", write: "available", notify: "checking" });
    const notify = await svc.getCharacteristic(NUS_NOTIFY);
    update({ stage: "Starting notifications", notify: "available", notifications: "checking" });
    await notify.startNotifications();
    notify.addEventListener("characteristicvaluechanged", onNotify);
    notifyChar = notify;
    update({ stage: "Ready", notifications: "available" });
  };

  const setupFailed = (error: unknown) => {
    reportError(h, diagnostics.stage, error);
    const patch: Partial<TransportDiagnostics> = { stage: "Connection failed" };
    for (const key of ["service", "write", "notify", "notifications"] as const) {
      if (diagnostics[key] === "checking") patch[key] = "unavailable";
    }
    update(patch);
    writeChar = null;
  };

  device.addEventListener("gattserverdisconnected", async () => {
    writeChar = null;
    notifyChar?.removeEventListener("characteristicvaluechanged", onNotify);
    notifyChar = null;
    update({ stage: manual ? "Disconnected" : "Reconnecting", service: "disconnected", write: "disconnected", notify: "disconnected", notifications: "disconnected" });
    if (manual) return h.onDisconnect(false);
    reportError(h, "Connection lost", new Error("Device disconnected unexpectedly; retrying up to 3 times"));
    h.onDisconnect(true);
    for (let a = 1; a <= 3; a++) {
      await new Promise((r) => setTimeout(r, 1000 * a));
      if (manual) return;
      try {
        await setup();
        h.onReconnected();
        return;
      } catch (error) { setupFailed(error); }
    }
    manual = true;
    device.gatt?.connected && device.gatt.disconnect();
    update({ stage: "Reconnect failed" });
    h.onDisconnect(false);
  });

  try { await setup(); } catch (error) {
    setupFailed(error);
    manual = true;
    device.gatt?.connected && device.gatt.disconnect();
    // Keep the failed discovery result visible after cleanup.
    update({ ...diagnostics, stage: "Connection failed" });
    throw error;
  }

  return {
    name: device.name || "ESP32",
    send(cmd) {
      const job = queue.then(async () => {
        if (!writeChar) throw new Error("Not connected");
        const data = encoder.encode(cmd + "\n");
        for (let o = 0; o < data.length; o += 20) {
          const chunk = data.slice(o, o + 20);
          if (writeChar.writeValueWithoutResponse) {
            try { await writeChar.writeValueWithoutResponse(chunk); continue; } catch { /* fallback */ }
          }
          await writeChar.writeValue(chunk);
        }
      });
      queue = job.catch(() => undefined);
      return job.catch((error) => { reportError(h, "Sending " + cmd, error); throw error; });
    },
    disconnect() {
      manual = true;
      device.gatt?.connected && device.gatt.disconnect();
    },
  };
}

/** Simulated ESP32 for demo mode. */
export function connectDemo(h: Handlers): Transport {
  h.onDiagnostics?.({ stage: "Demo active — no hardware checked", service: "simulated", write: "simulated", notify: "simulated", notifications: "simulated" });
  const s: CityState = { ...initialState, LDR: 2200, SOL: 4.6 };
  let thr = 1500;
  let t = 0;
  const emit = () => setTimeout(() => h.onLine(formatStatus(s)), 120);
  const applyAuto = () => {
    if (s.AUTO) { const dark = (s.LDR ?? 0) < thr; s.SL = dark; s.BL = dark; }
  };
  const timer = setInterval(() => {
    t += 0.15;
    s.LDR = Math.round(2048 + 1900 * Math.sin(t));
    s.SOL = Math.max(0, +(2.6 + 2.4 * Math.sin(t)).toFixed(2));
    applyAuto();
    h.onLine(formatStatus(s));
  }, 2000);
  emit();
  return {
    name: "HVM-SmartCity (Demo)",
    async send(cmd) {
      const [k = "", v = ""] = cmd.split(":");
      if (k in s && (v === "0" || v === "1")) (s as any)[k] = v === "1";
      else if (k === "THR") thr = Number(v) || 0;
      else if (k === "ALL") (["SL", "BL", "GR", "RD", "WT", "HT", "PM"] as const).forEach((x) => (s[x] = false));
      else if (k === "SCENE") {
        const p: Record<string, boolean[]> = {
          day: [false, false, true, false, true, true, true],
          night: [true, true, false, true, false, false, false],
          eco: [true, false, true, false, true, false, false],
          show: [true, true, true, true, true, true, true],
        };
        const arr = p[v];
        if (arr) (["SL", "BL", "GR", "RD", "WT", "HT", "PM"] as const).forEach((x, i) => (s[x] = !!arr[i]));
      }
      applyAuto();
      setTimeout(() => h.onLine("OK:" + cmd), 60);
      emit();
    },
    disconnect() {
      clearInterval(timer);
      h.onDiagnostics?.({ ...initialDiagnostics, stage: "Demo stopped" });
      h.onDisconnect(false);
    },
  };
}
