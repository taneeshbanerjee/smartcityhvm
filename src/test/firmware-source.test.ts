import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("original ESP32 firmware source", () => {
  it("keeps the firmware bytes and LF line endings", () => {
    const source = readFileSync(resolve(process.cwd(), "public/esp32-code/HVM_SmartCity_ESP32.ino"));
    const text = source.toString("utf8");

    expect(createHash("sha256").update(source).digest("hex")).toBe(
      "aa1ee763bc4038b5d31a1285697ef010c8d531a3d724c69c186d97ceae5bb4f2",
    );
    expect(text.match(/\n/g)).toHaveLength(412);
    expect(text.includes("\r")).toBe(false);
  });
});
