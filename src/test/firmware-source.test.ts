import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("original ESP32 firmware source", () => {
  it("keeps the firmware bytes and LF line endings", () => {
    const source = readFileSync(resolve(process.cwd(), "public/esp32-code/HVM_SmartCity_ESP32.ino"));
    const text = source.toString("utf8");

    expect(createHash("sha256").update(source).digest("hex")).toBe(
      "2cd1e95fdfa96b4439cd91ea15dbfe963979ed561598905a55ecbfabacc72087",
    );
    expect(text.match(/\n/g)).toHaveLength(355);
    expect(text.includes("\r")).toBe(false);
  });
});
