import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("original ESP32 firmware source", () => {
  it("keeps the firmware bytes and LF line endings", () => {
    const source = readFileSync(resolve(process.cwd(), "public/esp32-code/HVM_SmartCity_ESP32.ino"));
    const text = source.toString("utf8");

    expect(createHash("sha256").update(source).digest("hex")).toBe(
      "afff93c7c2715c50eab2412e854b13a56c906edc06a8f3a284fe7c48b2f76b01",
    );
    expect(text.match(/\n/g)).toHaveLength(1572);
    expect(text.includes("\r")).toBe(false);
  });
});
