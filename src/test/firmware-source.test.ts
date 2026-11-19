import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("original ESP32 firmware source", () => {
  it("keeps the firmware bytes and LF line endings", () => {
    const source = readFileSync(resolve(process.cwd(), "public/esp32-code/HVM_SmartCity_ESP32.ino"));
    const text = source.toString("utf8");

    expect(createHash("sha256").update(source).digest("hex")).toBe(
      "b569dd034ebf0a46637e4bc2ee248f1eabe8a01727b99783d14028b1f30cab47",
    );
    expect(text.match(/\n/g)).toHaveLength(356);
    expect(text.includes("\r")).toBe(false);
  });
});
