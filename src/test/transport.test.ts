import { afterEach, describe, expect, it, vi } from "vitest";
import { connectBle, connectDemo, type TransportDiagnostics, type TransportError } from "@/lib/transport";
import { NUS_SERVICE, NUS_WRITE, NUS_NOTIFY } from "@/lib/smartcity";

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

function harness(failAt?: string) {
  const diagnostics: TransportDiagnostics[] = [];
  const errors: TransportError[] = [];
  const characteristic = { startNotifications: vi.fn(async () => {}), addEventListener: vi.fn(), removeEventListener: vi.fn(), writeValue: vi.fn(async () => {}) };
  const service = { getCharacteristic: vi.fn(async (uuid: string) => { if (uuid === failAt) throw new Error("Characteristic missing"); return characteristic; }) };
  const device = { name: "HVM-SmartCity", addEventListener: vi.fn(), removeEventListener: vi.fn(), gatt: { connected: true, connect: vi.fn(async () => ({ getPrimaryService: vi.fn(async (uuid: string) => { if (uuid === failAt) throw new Error("Service missing"); return service; }) })), disconnect: vi.fn() } };
  const bluetooth = { requestDevice: vi.fn(async () => device) };
  vi.spyOn(navigator as Navigator & { bluetooth: unknown }, "bluetooth", "get").mockReturnValue(bluetooth);
  const handlers = { onLine: vi.fn(), onDisconnect: vi.fn(), onReconnected: vi.fn(), onDiagnostics: (d: TransportDiagnostics) => diagnostics.push(d), onError: (e: TransportError) => errors.push(e) };
  return { diagnostics, errors, handlers, characteristic, bluetooth, device };
}

// jsdom does not implement Web Bluetooth.
Object.defineProperty(navigator, "bluetooth", { configurable: true, get: () => undefined });

describe("Transport diagnostics", () => {
  it("rejects queued writes after disconnect and removes the device listener", async () => {
    const h = harness();
    const transport = await connectBle(false, h.handlers);
    const pending = transport.send("WT:1");
    transport.disconnect();
    await expect(pending).rejects.toThrow("Not connected");
    expect(h.characteristic.writeValue).not.toHaveBeenCalled();
    expect(h.device.removeEventListener).toHaveBeenCalledWith("gattserverdisconnected", expect.any(Function));
    expect(h.handlers.onDisconnect).toHaveBeenCalledWith(false);
  });
  it("does not emit pending demo replies after disconnect", async () => {
    vi.useFakeTimers();
    const h = harness();
    const demo = connectDemo(h.handlers);
    await demo.send("SL:1");
    demo.disconnect();
    await vi.advanceTimersByTimeAsync(2500);
    expect(h.handlers.onLine).not.toHaveBeenCalled();
    await expect(demo.send("SL:0")).rejects.toThrow("Not connected");
  });
  it("reports discovered NUS service, both characteristics and enabled notifications", async () => {
    const h = harness();
    const transport = await connectBle(false, h.handlers);
    expect(h.diagnostics.at(-1)).toEqual({ stage: "Ready", service: "available", write: "available", notify: "available", notifications: "available" });
    h.characteristic.writeValue.mockRejectedValueOnce(new Error("Write failed"));
    await expect(transport.send("SL:1")).rejects.toThrow("Write failed");
    expect(h.errors.at(-1)).toMatchObject({ stage: "Sending SL:1", message: "Write failed" });
  });
  it.each([NUS_SERVICE, NUS_WRITE, NUS_NOTIFY])("records the failed discovery check for %s", async (uuid) => {
    const h = harness(uuid);
    await expect(connectBle(false, h.handlers)).rejects.toThrow("missing");
    const key = uuid === NUS_SERVICE ? "service" : uuid === NUS_WRITE ? "write" : "notify";
    expect(h.diagnostics.at(-1)?.[key]).toBe("unavailable");
    expect(h.errors).toHaveLength(1);
    expect(h.device.gatt.disconnect).toHaveBeenCalled();
  });
  it("records pairing cancellation without claiming service availability", async () => {
    const h = harness();
    h.bluetooth.requestDevice.mockRejectedValueOnce(new DOMException("Pairing cancelled", "NotFoundError"));
    await expect(connectBle(false, h.handlers)).rejects.toThrow("Pairing cancelled");
    expect(h.errors[0]).toMatchObject({ stage: "Choosing device", name: "NotFoundError" });
    expect(h.diagnostics.at(-1)?.service).toBe("not checked");
  });
  it("labels demo checks simulated rather than hardware available", () => {
    vi.useFakeTimers();
    const h = harness();
    const demo = connectDemo(h.handlers);
    expect(h.diagnostics.at(-1)?.service).toBe("simulated");
    expect(h.diagnostics.at(-1)?.write).toBe("simulated");
    expect(h.diagnostics.at(-1)?.notify).toBe("simulated");
    demo.disconnect();
    expect(h.diagnostics.at(-1)?.service).toBe("not checked");
  });
});
describe("one wind turbines switch (no water turbine)", () => {
  it("parses the firmware status without a water turbine and maps voice commands to WT", async () => {
    const { parseStatus, parseVoice, initialState } = await import("@/lib/smartcity");
    expect(parseStatus("ST:SL=1,BL=0,GR=1,RD=0,WT=1,AUTO=0,MU=0;LDR=732")).toEqual({ SL: true, BL: false, GR: true, RD: false, WT: true, AUTO: false, MU: false, LDR: 732 });
    expect("HT" in initialState).toBe(false);
    expect(parseVoice("turn on the turbine")?.cmds).toEqual(["WT:1"]);
    expect(parseVoice("wind turbine off")?.cmds).toEqual(["WT:0"]);
    expect(parseVoice("fan on")?.cmds).toEqual(["WT:1"]);
  });

  it("demo scenes match the ESP32: turbines run in day, night and eco", async () => {
    vi.useFakeTimers();
    const { connectDemo } = await import("@/lib/transport");
    const { parseStatus } = await import("@/lib/smartcity");
    const lines: string[] = [];
    const demo = connectDemo({ onLine: (l) => { lines.push(l); }, onDisconnect: () => {}, onReconnected: () => {} });
    const last = () => parseStatus([...lines].reverse().find((l) => l.startsWith("ST:"))!)!;
    for (const [scene, want] of [["day", { SL: false, BL: false, GR: true, RD: false, WT: true }], ["night", { SL: true, BL: true, GR: false, RD: true, WT: true }], ["eco", { SL: true, BL: false, GR: true, RD: false, WT: true }]] as const) {
      await demo.send(`SCENE:${scene}`); vi.advanceTimersByTime(200);
      expect(last()).toMatchObject(want);
    }
    demo.disconnect(); vi.useRealTimers();
  });
});
