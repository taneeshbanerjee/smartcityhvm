import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("original ESP32 firmware source", () => {
  it("keeps the firmware bytes and LF line endings", () => {
    const source = readFileSync(resolve(process.cwd(), "public/esp32-code/HVM_SmartCity_ESP32.ino"));
    const text = source.toString("utf8");

    expect(createHash("sha256").update(source).digest("hex")).toBe(
      "6f671d241b6e58ba2395b8286c68f86da4792847395b3baa10755bddece5ce9b",
    );
    expect(text.match(/\n/g)).toHaveLength(1472);
    expect(text.includes("\r")).toBe(false);
  });
});
