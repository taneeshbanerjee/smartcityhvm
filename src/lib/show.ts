/**
 * Light patterns for the stage Show and Party Mode. The ESP32 runs them itself (no Bluetooth
 * latency); demo mode plays the same table. The firmware's SHOW_STEPS must stay identical to
 * SHOW_STEPS here (a test compares them).
 *
 * Light bits: 1 = street (white), 2 = building (yellow), 4 = green, 8 = red. The wind turbines
 * spin for the whole show and party.
 */
export const SHOW_BPM = 128;
/** A new step every half beat. */
export const SHOW_STEP_MS = Math.floor(60000 / SHOW_BPM / 2);
/** Steps per pattern: one bar of half beats. */
export const PATTERN_STEPS = 8;
export const PATTERN_COUNT = 100;

const W = 1, Y = 2, G = 4, R = 8, A = W | Y | G | R;
type Pattern = { name: string; steps: number[] };

const LETTER: Record<number, string> = { [W]: "W", [Y]: "Y", [G]: "G", [R]: "R" };
/** The 6 distinct circular orders of the four lights (white first). */
const ORDERS: number[][] = [[W, Y, G, R], [W, Y, R, G], [W, G, Y, R], [W, G, R, Y], [W, R, Y, G], [W, R, G, Y]];
const PAIRS = [W | Y, W | G, W | R, Y | G, Y | R, G | R];
const SPLITS: [number, number][] = [[W | Y, G | R], [W | G, Y | R], [W | R, Y | G]];
const rep = (seq: number[], times: number) => Array.from({ length: times }, () => seq).flat();
const label = (o: number[]) => o.map((b) => LETTER[b]).join("");

function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pattern families; each yields several variants. */
const FAMILIES: Pattern[][] = [
  ORDERS.map((o) => ({ name: `chase ${label(o)}`, steps: rep(o, 2) })),
  ORDERS.map((o) => ({ name: `bounce ${label(o)}`, steps: [o[0]!, o[1]!, o[2]!, o[3]!, o[2]!, o[1]!, o[0]!, o[1]!] })),
  [
    { name: "strobe", steps: rep([A, 0], 4) },
    { name: "double hit", steps: rep([A, A, 0, 0], 2) },
    { name: "downbeat", steps: rep([A, 0, 0, 0], 2) },
    { name: "triplet tail", steps: [A, 0, A, 0, A, A, A, 0] },
    { name: "syncopated", steps: [A, 0, 0, A, 0, 0, A, 0] },
    { name: "gallop", steps: [A, A, A, 0, A, 0, A, 0] },
    { name: "offbeat", steps: [0, A, 0, A, A, 0, A, A] },
    { name: "skip", steps: [A, 0, A, A, 0, A, 0, 0] },
  ],
  ORDERS.map((o) => ({ name: `fill ${label(o)}`, steps: [o[0]!, o[0]! | o[1]!, o[0]! | o[1]! | o[2]!, A, A, 0, A, 0] })),
  [
    ...SPLITS.map(([p, q]) => ({ name: `pairs ${p}/${q}`, steps: rep([p, q], 4) })),
    ...SPLITS.map(([p, q]) => ({ name: `pairs gap ${p}/${q}`, steps: rep([p, 0, q, 0], 2) })),
    ...SPLITS.map(([p, q]) => ({ name: `pairs hold ${p}/${q}`, steps: rep([p, p, q, q], 2) })),
  ],
  ORDERS.map((o) => ({ name: `wave ${label(o)}`, steps: [o[0]!, o[0]! | o[1]!, o[1]! | o[2]!, o[2]! | o[3]!, o[3]!, o[2]! | o[3]!, o[1]! | o[2]!, o[0]! | o[1]!] })),
  [
    { name: "police red/white", steps: [R, 0, R, 0, W, 0, W, 0] },
    { name: "police swap", steps: rep([R, W], 4) },
    { name: "police cross", steps: rep([R | Y, 0, W | G, 0], 2) },
    { name: "police hold", steps: rep([R, R, W, W], 2) },
    { name: "amber/green", steps: [Y, 0, Y, 0, G, 0, G, 0] },
    { name: "four-colour flash", steps: [Y, G, Y, G, R, W, R, W] },
  ],
  ORDERS.map((o) => ({ name: `double chase ${label(o)}`, steps: rep([o[0]! | o[1]!, o[1]! | o[2]!, o[2]! | o[3]!, o[3]! | o[0]!], 2) })),
  [W, Y, G, R].flatMap((l) => [
    { name: `${LETTER[l]} strobe`, steps: rep([l, 0], 4) },
    { name: `${LETTER[l]} against the rest`, steps: rep([l, A ^ l], 4) },
  ]),
  ORDERS.map((o) => ({ name: `drain ${label(o)}`, steps: [A, A ^ o[0]!, A ^ o[0]! ^ o[1]!, o[3]!, 0, o[3]!, 0, A] })),
  PAIRS.map((p) => ({ name: `pair strobe ${p}`, steps: rep([p, 0], 4) })),
  ORDERS.map((o) => ({ name: `rise and fall ${label(o)}`, steps: [o[0]!, o[0]! | o[1]!, o[0]! | o[1]! | o[2]!, A, o[0]! | o[1]! | o[2]!, o[0]! | o[1]!, o[0]!, 0] })),
  [W, Y, G, R, A].map((l) => ({ name: `heartbeat ${l}`, steps: [l, 0, l, 0, 0, 0, 0, 0] })),
  ORDERS.map((o) => ({ name: `spaced chase ${label(o)}`, steps: [o[0]!, 0, o[1]!, 0, o[2]!, 0, o[3]!, 0] })),
  Array.from({ length: 10 }, (_, i) => {
    const rnd = random(2047 + i * 97);
    return { name: `sparkle ${i + 1}`, steps: Array.from({ length: PATTERN_STEPS }, () => 1 + Math.floor(rnd() * 15)) };
  }),
  [
    { name: "count up", steps: [1, 2, 3, 4, 5, 6, 7, 8] },
    { name: "count high", steps: [9, 10, 11, 12, 13, 14, 15, 0] },
  ],
  [
    { name: "converge", steps: rep([W | R, Y | G, A, 0], 2) },
    { name: "expand", steps: rep([Y | G, W | R, A, 0], 2) },
    { name: "outer inner hold", steps: [W | R, W | R, Y | G, Y | G, A, A, 0, 0] },
  ],
];

/** Take one pattern from each family in turn (so neighbours always look different), skip repeats. */
function buildPatterns(): Pattern[] {
  const out: Pattern[] = [], seen = new Set<string>(), queues = FAMILIES.map((f) => [...f]);
  while (out.length < PATTERN_COUNT && queues.some((q) => q.length)) {
    for (const q of queues) {
      const p = q.shift();
      if (!p || out.length >= PATTERN_COUNT) continue;
      const key = p.steps.join(",");
      if (!seen.has(key)) { seen.add(key); out.push(p); }
    }
  }
  return out;
}

export const SHOW_PATTERNS: Pattern[] = buildPatterns();
export const SHOW_STEPS: number[] = SHOW_PATTERNS.flatMap((p) => p.steps);

export function showLights(mask: number) {
  return { SL: !!(mask & W), BL: !!(mask & Y), GR: !!(mask & G), RD: !!(mask & R) };
}
