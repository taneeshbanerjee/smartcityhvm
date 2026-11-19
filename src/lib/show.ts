/**
 * The stage light show. The ESP32 runs it itself (no Bluetooth latency); demo mode plays the same
 * patterns. These must stay identical to SHOW_STEPS in the firmware (a test compares them).
 * Light bits: 1 = street (white), 2 = building (yellow), 4 = green, 8 = red. The wind turbines
 * spin for the whole show.
 */
export const SHOW_BPM = 128;
/** A new step every half beat. */
export const SHOW_STEP_MS = Math.floor(60000 / SHOW_BPM / 2);

const W = 1, Y = 2, G = 4, R = 8, A = W | Y | G | R;

export const SHOW_PATTERNS: { name: string; steps: number[] }[] = [
  { name: "chase", steps: [W, Y, G, R, W, Y, G, R, W, Y, G, R, W, Y, G, R] },
  { name: "bounce", steps: [W, Y, G, R, G, Y, W, Y, G, R, G, Y, W, Y, G, R] },
  { name: "alternating pairs", steps: Array.from({ length: 16 }, (_, i) => (i % 2 ? Y | R : W | G)) },
  { name: "build and drop", steps: [W, W | Y, W | Y | G, A, A, 0, A, 0, R, R | G, R | G | Y, A, A, 0, A, 0] },
  { name: "strobe", steps: Array.from({ length: 16 }, (_, i) => (i % 2 ? 0 : A)) },
  { name: "red and white flash", steps: [R, 0, R, 0, W, 0, W, 0, R, 0, R, 0, W, 0, W, 0] },
  { name: "fill and drain", steps: [W, W | Y, W | Y | G, A, Y | G | R, G | R, R, 0, R, R | G, R | G | Y, A, W | Y | G, W | Y, W, 0] },
  { name: "twin flash", steps: [W | Y, 0, G | R, 0, W | Y, 0, G | R, 0, W | R, 0, Y | G, 0, W | R, 0, Y | G, 0] },
  { name: "sparkle", steps: [W | G, R, Y, W | R, G, Y | R, W, G | Y, R, W | Y, G | R, W, Y | G, R, W | G | R, A] },
  { name: "finale", steps: [A, 0, A, 0, A, A, 0, 0, A, 0, A, 0, A, A, A, 0] },
];

export const SHOW_STEPS: number[] = SHOW_PATTERNS.flatMap((p) => p.steps);

export function showLights(mask: number) {
  return { SL: !!(mask & W), BL: !!(mask & Y), GR: !!(mask & G), RD: !!(mask & R) };
}
