import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("original ESP32 firmware source", () => {
  it("keeps the firmware bytes and LF line endings", () => {
    const source = readFileSync(resolve(process.cwd(), "public/esp32-code/HVM_SmartCity_ESP32.ino"));
    const text = source.toString("utf8");

    expect(createHash("sha256").update(source).digest("hex")).toBe(
      "f8a7913bca7cc7d9968491d9ebdc42a97c822262fb797e560b8ebad92df169aa",
    );
    expect(text.match(/\n/g)).toHaveLength(562);
    expect(text.includes("\r")).toBe(false);
  });
});
