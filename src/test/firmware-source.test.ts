import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("original ESP32 firmware source", () => {
  it("keeps the firmware bytes and LF line endings", () => {
    const source = readFileSync(resolve(process.cwd(), "public/esp32-code/HVM_SmartCity_ESP32.ino"));
    const text = source.toString("utf8");

    expect(createHash("sha256").update(source).digest("hex")).toBe(
      "87103eb158cfe26a066f0e171b3bc38bff5f84e8418ff5a19e069401607498f5",
    );
    expect(text.match(/\n/g)).toHaveLength(498);
    expect(text.includes("\r")).toBe(false);
  });
});
