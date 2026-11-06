import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("original ESP32 firmware source", () => {
  it("preserves the uploaded file bytes and CRLF line endings", () => {
    const source = readFileSync(resolve(process.cwd(), "public/esp32-code/HVM_SmartCity_ESP32.ino"));
    const text = source.toString("utf8");

    expect(createHash("sha256").update(source).digest("hex")).toBe(
      "9116666bd11c28296acc7553db9d6c88d4c9e0aed7ee9240dd3ff81deda2ce90",
    );
    expect(text.match(/\r\n/g)).toHaveLength(256);
    expect(text.replace(/\r\n/g, "").includes("\n")).toBe(false);
  });
});