import { afterEach, describe, expect, it, vi } from "vitest";
import { canLockLandscape, enterLandscape, leaveLandscape } from "@/lib/landscape";

const calls: string[] = [];
function device({ touch, lock }: { touch: boolean; lock: boolean }) {
  calls.length = 0;
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("coarse") ? touch : false, addEventListener() {}, removeEventListener() {} }));
  window.matchMedia = globalThis.matchMedia as typeof window.matchMedia;
  let fs: Element | null = null;
  Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => fs });
  document.documentElement.requestFullscreen = vi.fn(async () => { calls.push("fullscreen"); fs = document.documentElement; });
  document.exitFullscreen = vi.fn(async () => { calls.push("exit"); fs = null; });
  Object.defineProperty(screen, "orientation", {
    configurable: true,
    value: lock ? { lock: vi.fn(async (o: string) => { calls.push(`lock ${o}`); }), unlock: vi.fn(() => { calls.push("unlock"); }) } : {},
  });
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("launch video landscape", () => {
  it("on a phone: goes full screen, then locks to landscape; leaving undoes both", async () => {
    device({ touch: true, lock: true });
    expect(canLockLandscape()).toBe(true);
    await expect(enterLandscape()).resolves.toBe(true);
    expect(calls).toEqual(["fullscreen", "lock landscape"]);
    await leaveLandscape();
    expect(calls).toEqual(["fullscreen", "lock landscape", "unlock", "exit"]);
  });

  it("does nothing on a desktop (no touch) or where locking isn't allowed (iPhone)", async () => {
    device({ touch: false, lock: true });
    await expect(enterLandscape()).resolves.toBe(false);
    device({ touch: true, lock: false });
    await expect(enterLandscape()).resolves.toBe(false);
    expect(calls).toEqual([]);
  });
});
