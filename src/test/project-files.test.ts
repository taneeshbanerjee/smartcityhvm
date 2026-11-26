import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { THREE_R128_CDN, toStandaloneHtml } from "@/lib/standalone-download";

const file = (path: string) => resolve(process.cwd(), "public", path);

describe("project files on the website", () => {
  it("has a preview image and a download image for each of the 6 circuit diagram pages", () => {
    const pdf = readFileSync(file("circuit-diagram/circuit_diagram.pdf")).toString("latin1");
    expect(pdf.match(/\/Type\s*\/Page[^s]/g)).toHaveLength(6);
    for (let n = 1; n <= 6; n++) {
      expect(existsSync(file(`circuit-diagram/page-${n}.webp`))).toBe(true);
      expect(existsSync(file(`circuit-diagram/page-${n}.png`))).toBe(true);
    }
  });

  it("serves the theme song exactly as uploaded, with its cover art", () => {
    const song = readFileSync(file("theme-song/Smart_City_Dawn.mp3"));
    expect(createHash("sha256").update(song).digest("hex")).toBe("4e1ba5fb639717181c43249eb91d38557fa265bba96ea0419c3a0d42adb96411");
    expect(song.subarray(0, 3).toString("latin1")).toBe("ID3");
    expect(existsSync(file("theme-song/cover.jpg"))).toBe(true);
  });

  it("serves the full HD 1-minute launch video unchanged, with posters for both launch videos", () => {
    const video = readFileSync(file("launch-video/Smart_City_Launch.mp4"));
    expect(createHash("sha256").update(video).digest("hex")).toBe("95cbca89cafefb3751282a9047aaf9fd46f5328590ac29dc02f9c7d7c5ac82d1");
    expect(video.subarray(4, 8).toString("latin1")).toBe("ftyp");
    expect(existsSync(file("launch-video/poster.jpg"))).toBe(true);
    expect(existsSync(file("launch-video/poster-30s.jpg"))).toBe(true);
  });

  it("lets every hydro dam size be edited, keeping pieces, steps and board scaling in sync", () => {
    const html = readFileSync(file("hydro-dam-template/index.html"), "utf8");
    document.body.innerHTML = html.slice(html.indexOf("<body>") + 6, html.lastIndexOf("<script>"));
    new Function(html.slice(html.lastIndexOf("<script>") + 8, html.lastIndexOf("</script>")))();
    const $ = (sel: string) => document.querySelector(sel) as HTMLInputElement;
    const inputs = (key: string) => [...document.querySelectorAll<HTMLInputElement>(`#parts input[data-key="${key}"]`)];
    const type = (el: HTMLInputElement, value: string) => { el.value = value; el.dispatchEvent(new Event("input", { bubbles: true })); };
    const steps = () => $("#steps").textContent ?? "";

    expect(document.querySelectorAll("#parts input[data-key]").length).toBe(25);
    expect(steps()).toContain("cut a thermocol block 14.5 cm long, 2.2 cm wide and 2.4 cm high");

    // edit the gate width: steps and the gate pieces follow, other sizes don't change
    type(inputs("gateW")[0]!, "3");
    expect(steps()).toContain("(3 cm × 1.6 cm each)");
    expect([...document.querySelectorAll("#pieces svg")].map((svg) => svg.textContent).join("|")).toContain("3 cm × 1.6 cm");
    expect(inputs("gateW")[0]!.classList.contains("edited")).toBe(true);

    // a shared size (dam height) edited in one row updates the other rows
    type(inputs("damH")[0]!, "3");
    expect(inputs("damH").map((el) => el.value)).toEqual(["3", "3", "3"]);

    // doubling the board doubles defaults and keeps edited sizes in proportion
    type($("#board"), "220");
    expect(inputs("gateW")[0]!.value).toBe("6");
    expect(inputs("gateH")[0]!.value).toBe("3.2");
    expect(steps()).toContain("29 cm long");

    // reset returns to the defaults for the current board
    $("#resetSizes").click();
    expect(inputs("gateW")[0]!.value).toBe("4.8");
    expect(inputs("gateW")[0]!.classList.contains("edited")).toBe(false);
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
