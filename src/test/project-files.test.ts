import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { THREE_R128_CDN, toStandaloneHtml } from "@/lib/standalone-download";

const file = (path: string) => resolve(process.cwd(), "public", path);

describe("project files on the website", () => {
  it("has a preview image and a download image for every circuit diagram page, including the buzzer page", () => {
    const pdf = readFileSync(file("circuit-diagram/circuit_diagram.pdf")).toString("latin1");
    expect(pdf.match(/\/Type\s*\/Page[^s]/g)).toHaveLength(5);
    for (let n = 1; n <= 5; n++) {
      expect(existsSync(file(`circuit-diagram/page-${n}.webp`))).toBe(true);
      expect(existsSync(file(`circuit-diagram/page-${n}.png`))).toBe(true);
    }
  });

  it("serves the hydro dam template exactly as published", () => {
    const html = readFileSync(file("hydro-dam-template/index.html"));
    expect(createHash("sha256").update(html).digest("hex")).toBe("931d3eedb8aae4f732d4bfd6c6163cdd0d04c2b7c3dea9d87edfa2a4b16682a1");
  });

  it("turns the game and the 3D model into standalone downloads that load three.js r128 from the CDN", () => {
    for (const [page, script] of [
      ["smart-city-game/index.html", "/smart-city-game/three.min.js"],
      ["smart-city-model/index.html", "/smart-city-model/three.min.js"],
    ] as const) {
      const html = readFileSync(file(page), "utf8");
      const standalone = toStandaloneHtml(html, script);
      expect(standalone).toContain(`<script src="${THREE_R128_CDN}"></script>`);
      expect(standalone).not.toContain(script);
      expect(standalone.length).toBe(html.length - script.length + THREE_R128_CDN.length);
    }
    expect(() => toStandaloneHtml("<html></html>", "/x.js")).toThrow();
  });
});
