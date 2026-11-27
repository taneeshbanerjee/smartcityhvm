import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("original ESP32 firmware source", () => {
  it("keeps the firmware bytes and LF line endings", () => {
    const source = readFileSync(resolve(process.cwd(), "public/esp32-code/HVM_SmartCity_ESP32.ino"));
    const text = source.toString("utf8");

    expect(createHash("sha256").update(source).digest("hex")).toBe(
      "f7aef4400da6ae691569e75a3c25e7b8016c61088a884db014c56acc31dc49de",
    );
    expect(text.match(/\n/g)).toHaveLength(1627);
    expect(text.includes("\r")).toBe(false);
  });
});
