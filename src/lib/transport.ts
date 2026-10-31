import { NUS_NOTIFY, NUS_SERVICE, NUS_WRITE, formatStatus, initialState, type CityState } from "./smartcity";

export interface Transport {
  send(cmd: string): Promise<void>;
  disconnect(): void;
  name: string;
}

interface Handlers {
  onLine: (line: string) => void;
  onDisconnect: (reconnecting: boolean) => void;
  onReconnected: () => void;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function isBleSupported() {
  return typeof navigator !== "undefined" && !!(navigator as any).bluetooth;
}

export async function connectBle(showAll: boolean, h: Handlers): Promise<Transport> {
  const bt = (navigator as any).bluetooth;
  if (bt.getAvailability && !(await bt.getAvailability())) {
    const e = new Error("Bluetooth is turned off or unavailable");
    e.name = "BluetoothOff";
    throw e;
  }
  const device: any = await bt.requestDevice(
    showAll
      ? { acceptAllDevices: true, optionalServices: [NUS_SERVICE] }
      : { filters: [{ namePrefix: "HVM-SmartCity" }, { services: [NUS_SERVICE] }], optionalServices: [NUS_SERVICE] },
  );

  let writeChar: any = null;
  let manual = false;
  let buffer = "";
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let queue: Promise<void> = Promise.resolve();

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
    const server = await device.gatt.connect();
    const svc = await server.getPrimaryService(NUS_SERVICE);
    writeChar = await svc.getCharacteristic(NUS_WRITE);
    const notify = await svc.getCharacteristic(NUS_NOTIFY);
    await notify.startNotifications();
    notify.addEventListener("characteristicvaluechanged", onNotify);
  };

  device.addEventListener("gattserverdisconnected", async () => {
    writeChar = null;
    if (manual) return h.onDisconnect(false);
    h.onDisconnect(true);
    for (let a = 1; a <= 3; a++) {
      await new Promise((r) => setTimeout(r, 1000 * a));
      try {
        await setup();
        h.onReconnected();
        return;
      } catch { /* retry */ }
    }
    h.onDisconnect(false);
  });

  await setup();

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
      return job;
    },
    disconnect() {
      manual = true;
      device.gatt?.connected && device.gatt.disconnect();
    },
  };
}

/** Simulated ESP32 for demo mode. */
export function connectDemo(h: Handlers): Transport {
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
      h.onDisconnect(false);
    },
  };
}
