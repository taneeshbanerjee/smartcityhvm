import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Wiring from circuit_diagram.pdf pages 1-4. If a pin in the firmware changes, the circuit no
// longer matches the diagram and that part of the model stops working, so this test fails.
const DIAGRAM = {
  PIN_SL: 13,    // page 1: white LED (street lights)
  PIN_BL: 12,    // page 1: yellow LED (building lights)
  PIN_GR: 14,    // page 1: green LED
  PIN_RD: 15,    // page 1: red LED
  PIN_M1_A: 27,  // page 3: L298N IN1 (motor OUT1/OUT2, page 2)
  PIN_M1_B: 26,  // page 3: L298N IN2
  PIN_M2_A: 25,  // page 3: L298N IN3 (motor OUT3/OUT4, page 2)
  PIN_M2_B: 33,  // page 3: L298N IN4
  PIN_LDR: 32,   // page 4: 3V3 -> LDR -> D32 -> resistor -> GND
};

describe("ESP32 pins match the circuit diagram (pages 1-4)", () => {
  it("uses exactly the pins drawn in the diagram", () => {
    const ino = readFileSync(resolve(process.cwd(), "public/esp32-code/HVM_SmartCity_ESP32.ino"), "utf8");
    const pins = Object.fromEntries([...ino.matchAll(/const uint8_t (PIN_\w+)\s*=\s*(\d+);/g)].map((m) => [m[1], Number(m[2])]));
    for (const [name, pin] of Object.entries(DIAGRAM)) expect(pins[name], name).toBe(pin);
    // no two parts share a pin
    const used = Object.values(pins);
    expect(new Set(used).size).toBe(used.length);
  });
});
