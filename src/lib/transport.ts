import { NUS_NOTIFY, NUS_SERVICE, NUS_WRITE, formatStatus, initialState, type CityState } from "./smartcity";
import { PATTERN_COUNT, PATTERN_STEPS, showLights, SHOW_STEP_MS, SHOW_STEPS } from "./show";

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
  const detail = typeof error === "object" && error !== null ? error as { name?: unknown; message?: unknown } : undefined;
  h.onError?.({ time: new Date().toLocaleTimeString(), stage,
    name: typeof detail?.name === "string" ? detail.name : "TransportError",
    message: typeof detail?.message === "string" ? detail.message : String(error) });
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
  let generation = 0;

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
    if (manual) { device.gatt.disconnect(); throw new Error("Connection cancelled"); }
    update({ stage: "Finding NUS service", service: "checking" });
    const svc = await server.getPrimaryService(NUS_SERVICE);
    if (manual) throw new Error("Connection cancelled");
    update({ stage: "Finding write characteristic", service: "available", write: "checking" });
    writeChar = await svc.getCharacteristic(NUS_WRITE);
    if (manual) { writeChar = null; throw new Error("Connection cancelled"); }
    update({ stage: "Finding notify characteristic", write: "available", notify: "checking" });
    const notify = await svc.getCharacteristic(NUS_NOTIFY);
    if (manual) throw new Error("Connection cancelled");
    update({ stage: "Starting notifications", notify: "available", notifications: "checking" });
    await notify.startNotifications();
    if (manual) throw new Error("Connection cancelled");
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

  const onGattDisconnected = async () => {
    generation++;
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
      } catch (error) { if (manual) return; setupFailed(error); }
    }
    manual = true;
    device.removeEventListener("gattserverdisconnected", onGattDisconnected);
    if (device.gatt?.connected) device.gatt.disconnect();
    update({ stage: "Reconnect failed" });
    h.onDisconnect(false);
  };
  device.addEventListener("gattserverdisconnected", onGattDisconnected);

  try { await setup(); } catch (error) {
    setupFailed(error);
    const failedDiagnostics = { ...diagnostics };
    manual = true;
    device.removeEventListener("gattserverdisconnected", onGattDisconnected);
    if (device.gatt?.connected) device.gatt.disconnect();
    // Keep the failed discovery result visible after cleanup.
    update({ ...failedDiagnostics, stage: "Connection failed" });
    throw error;
  }

  return {
    name: device.name || "ESP32",
    send(cmd) {
      const sentGeneration = generation;
      const job = queue.then(async () => {
        if (!writeChar || manual || sentGeneration !== generation) throw new Error("Not connected");
        const data = encoder.encode(cmd + "\n");
        for (let o = 0; o < data.length; o += 20) {
          if (!writeChar || manual || sentGeneration !== generation) throw new Error("Connection changed during send");
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
      generation++;
      writeChar = null;
      device.removeEventListener("gattserverdisconnected", onGattDisconnected);
      notifyChar?.removeEventListener("characteristicvaluechanged", onNotify);
      notifyChar = null;
      if (device.gatt?.connected) device.gatt.disconnect();
      update({ stage: "Disconnected", service: "disconnected", write: "disconnected", notify: "disconnected", notifications: "disconnected" });
      h.onDisconnect(false);
    },
  };
}

/** Simulated ESP32 for demo mode. */
export function connectDemo(h: Handlers): Transport {
  h.onDiagnostics?.({ stage: "Demo active — no hardware checked", service: "simulated", write: "simulated", notify: "simulated", notifications: "simulated" });
  // Like the firmware: Auto is on from the start, threshold automatic (THR 0)
  const s: CityState = { ...initialState, AUTO: true, LDR: 2200, THR: 0, LON: 1500 };
  let t = 0;
  let closed = false;
  // party mode, simulated like the firmware: the 100 patterns step on every half beat of the song
  // (a new pattern every bar), turbines on, then the city is restored
  let bpm = 120;
  let songSixteenths = 0;
  // stage show, simulated like the firmware: same patterns and tempo, turbines on, city restored afterwards
  let show: { timer: ReturnType<typeof setInterval>; saved: CityState; step: number } | null = null;
  const showFrame = () => {
    if (!show || closed) return;
    Object.assign(s, showLights(SHOW_STEPS[show.step] ?? 0), { WT: true, AUTO: false, SH: true });
    h.onLine(formatStatus(s));
  };
  const stopShow = (restore: boolean) => {
    if (!show) return;
    clearInterval(show.timer);
    if (restore) Object.assign(s, { ...show.saved, LDR: s.LDR, DK: s.DK, THR: s.THR, LON: s.LON });
    show = null;
    s.SH = false;
  };
  const startShow = () => {
    const saved = show ? show.saved : { ...s };
    if (show) clearInterval(show.timer);
    show = { saved, step: 0, timer: setInterval(() => { if (show) { show.step = (show.step + 1) % SHOW_STEPS.length; showFrame(); } }, SHOW_STEP_MS) };
    showFrame();
  };
  let party: { timer: ReturnType<typeof setInterval>; saved: CityState; half: number } | null = null;
  let partyPattern = 0;   // like the firmware, each party carries on from where the last one stopped
  const stopParty = (restore: boolean) => {
    if (!party) return;
    clearInterval(party.timer);
    partyPattern = (partyPattern + Math.floor(Math.max(0, party.half - 1) / PATTERN_STEPS) + 1) % PATTERN_COUNT;
    if (restore) Object.assign(s, { ...party.saved, LDR: s.LDR, DK: s.DK, THR: s.THR, LON: s.LON });
    party = null;
    s.MU = false;
  };
  const startParty = () => {
    if (!songSixteenths) return;
    stopParty(true);
    stopShow(true);
    const saved = { ...s };
    const halfBeats = Math.ceil(songSixteenths / 2);
    const step = () => {
      if (closed || !party) return;
      if (party.half >= halfBeats) { stopParty(true); h.onLine(formatStatus(s)); return; }
      const i = (partyPattern * PATTERN_STEPS + party.half) % SHOW_STEPS.length;
      Object.assign(s, showLights(SHOW_STEPS[i] ?? 0), { WT: true, AUTO: false, MU: true });
      party.half++;
      h.onLine(formatStatus(s));
    };
    party = { timer: setInterval(step, 30000 / bpm), saved, half: 0 };
    step();
  };
  const emit = () => setTimeout(() => { if (!closed) h.onLine(formatStatus(s)); }, 120);
  // The demo's sensor is a slow sine wave, so "automatic" uses a fixed level of 1500 here; the
  // firmware learns the room's light level instead. Hysteresis like the firmware.
  const applyAuto = () => {
    const thr = s.THR ?? 0;
    const on = thr > 0 ? Math.max(0, thr - 100) : 1500;
    const off = thr > 0 ? Math.min(4095, thr + 100) : 1700;
    s.LON = on;
    const ldr = s.LDR ?? 0;
    if (ldr < on) s.DK = true;
    else if (ldr > off) s.DK = false;
    if (s.AUTO) { s.SL = s.DK; s.BL = s.DK; }
  };
  applyAuto();
  const timer = setInterval(() => {
    t += 0.15;
    s.LDR = Math.round(2048 + 1900 * Math.sin(t));
    applyAuto();
    h.onLine(formatStatus(s));
  }, 2000);
  emit();
  return {
    name: "HVM-SmartCity (Demo)",
    async send(cmd) {
      if (closed) throw new Error("Not connected");
      const [k = "", v = ""] = cmd.split(":");
      if (k === "MB") { stopParty(true); bpm = Math.min(180, Math.max(60, Number(v) || 120)); songSixteenths = 0; }
      else if (k === "MA") { for (let i = 0; i + 3 < v.length; i += 4) songSixteenths += parseInt(v.slice(i + 2, i + 4), 16) || 0; return; }
      else if (k === "MP") { if (v === "1") startParty(); else stopParty(true); }
      else if (k !== "GET") stopParty(true);
      if ((k === "SCENE" && v.toLowerCase() === "show") || k === "SHOW") {
        if (k === "SHOW" && v === "0") stopShow(true); else startShow();
        setTimeout(() => { if (!closed) h.onLine("OK:" + cmd); }, 60); emit(); return;
      }
      if (!["GET", "MB", "MA", "MP"].includes(k)) stopShow(true);
      if (k === "MB" || k === "MP") { setTimeout(() => { if (!closed) h.onLine("OK:" + cmd); }, 60); emit(); return; }
      if (k === "THR") s.THR = Math.min(4095, Math.max(0, Number(v) || 0));
      else if (k in s && (v === "0" || v === "1")) {
        (s as any)[k] = v === "1";
        if (k === "SL" || k === "BL") s.AUTO = false;   // switching a light by hand turns Auto off
      }
      else if (k === "ALL") { (["SL", "BL", "GR", "RD", "WT"] as const).forEach((x) => (s[x] = false)); s.AUTO = false; }
      else if (k === "SCENE") {
        s.AUTO = false;
        // same scenes as the ESP32 firmware (SL, BL, GR, RD, WT); the show is handled above
        const p: Record<string, boolean[]> = {
          day: [false, false, true, false, true],
          night: [true, true, false, true, true],
          eco: [true, false, true, false, true],
        };
        const arr = p[v];
        if (arr) (["SL", "BL", "GR", "RD", "WT"] as const).forEach((x, i) => (s[x] = !!arr[i]));
      }
      applyAuto();
      setTimeout(() => { if (!closed) h.onLine("OK:" + cmd); }, 60);
      emit();
    },
    disconnect() {
      closed = true;
      stopParty(false);
      stopShow(false);
      clearInterval(timer);
      h.onDiagnostics?.({ ...initialDiagnostics, stage: "Demo stopped" });
      h.onDisconnect(false);
    },
  };
}
