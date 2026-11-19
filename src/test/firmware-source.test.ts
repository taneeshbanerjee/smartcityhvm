import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("original ESP32 firmware source", () => {
  it("keeps the firmware bytes and LF line endings", () => {
    const source = readFileSync(resolve(process.cwd(), "public/esp32-code/HVM_SmartCity_ESP32.ino"));
    const text = source.toString("utf8");

    expect(createHash("sha256").update(source).digest("hex")).toBe(
      "66e063718dda2569dc6d7236ae955c53c7205cde50994646793ff261bfc320e1",
    );
    expect(text.match(/\n/g)).toHaveLength(406);
    expect(text.includes("\r")).toBe(false);
  });
});
