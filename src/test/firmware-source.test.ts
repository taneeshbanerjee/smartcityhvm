import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("original ESP32 firmware source", () => {
  it("preserves the uploaded file bytes and LF line endings", () => {
    const source = readFileSync(resolve(process.cwd(), "public/esp32-code/HVM_SmartCity_ESP32.ino"));
    const text = source.toString("utf8");

    expect(createHash("sha256").update(source).digest("hex")).toBe(
      "b50efa5188194c4c0a9c8c50f30fb982b002087e99881de59a26009970e8df04",
    );
    expect(text.match(/\n/g)).toHaveLength(247);
    expect(text.includes("\r")).toBe(false);
  });
});
