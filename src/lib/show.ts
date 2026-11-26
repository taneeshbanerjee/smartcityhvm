/**
 * Light patterns for the stage Show and Party Mode: 1000 patterns of one bar (8 steps), all
 * different. The ESP32 runs them itself (no Bluetooth latency); demo mode plays the same table.
 * The firmware's SHOW_STEPS must stay identical to SHOW_STEPS here (a test compares them).
 *
 * Light bits: 1 = street (white), 2 = building (yellow), 4 = green, 8 = red. The wind turbines
 * spin for the whole show and party.
 */
export const SHOW_BPM = 128;
/** A new step every half beat. */
export const SHOW_STEP_MS = Math.floor(60000 / SHOW_BPM / 2);
/** Steps per pattern: one bar of half beats. */
export const PATTERN_STEPS = 8;
export const PATTERN_COUNT = 1000;
/** The original 100 patterns come first, unchanged; the rest follow from the extra families. */
const FIRST_COUNT = 100;

const W = 1, Y = 2, G = 4, R = 8, A = W | Y | G | R;
type Pattern = { name: string; steps: number[] };

const LETTER: Record<number, string> = { [W]: "W", [Y]: "Y", [G]: "G", [R]: "R" };
/** Letters for any set of lights, e.g. 5 -> "WG". */
const colour = (mask: number) => [W, Y, G, R].filter((b) => mask & b).map((b) => LETTER[b]).join("") || "-";
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

/* ---------- the 900 extra patterns ---------- */

/** Musical rhythms over one bar of half beats (1 = a hit). */
const RHYTHMS: number[][] = [
  [1, 0, 1, 0, 1, 0, 1, 0], [0, 1, 0, 1, 0, 1, 0, 1], [1, 0, 0, 1, 0, 0, 1, 0], [1, 0, 0, 1, 0, 0, 1, 1],
  [1, 1, 0, 1, 1, 0, 1, 0], [1, 0, 1, 1, 0, 1, 1, 0], [1, 1, 1, 0, 1, 1, 1, 0], [1, 0, 0, 0, 1, 0, 1, 0],
  [1, 0, 1, 0, 0, 0, 1, 0], [1, 1, 0, 0, 1, 1, 0, 0], [1, 0, 0, 1, 1, 0, 0, 1], [1, 1, 1, 1, 0, 0, 0, 0],
  [0, 0, 0, 0, 1, 1, 1, 1], [1, 0, 1, 0, 1, 1, 1, 1], [1, 1, 0, 1, 0, 1, 1, 0], [1, 0, 1, 1, 1, 0, 1, 0],
  [0, 1, 1, 0, 0, 1, 1, 0], [1, 0, 0, 0, 0, 0, 1, 1], [1, 1, 1, 0, 0, 1, 0, 0], [1, 0, 1, 0, 1, 0, 0, 1],
];
const MASKS = Array.from({ length: 15 }, (_, i) => i + 1);
/** Every order of the four lights (24). */
const PERMS: number[][] = (() => {
  const out: number[][] = [];
  const go = (rest: number[], acc: number[]) => {
    if (!rest.length) { out.push(acc); return; }
    rest.forEach((b, i) => go([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, b]));
  };
  go([W, Y, G, R], []);
  return out;
})();
/** Single lights and pairs, for two-colour call and response. */
const GROUPS = [W, Y, G, R, W | Y, W | G, W | R, Y | G, Y | R, G | R];

function shuffled<T>(list: T[], seed: number): T[] {
  const rnd = random(seed), out = [...list];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j]!, out[i]!]; }
  return out;
}

const EXTRA_FAMILIES: Pattern[][] = [
  // one colour (or colour set) hitting a rhythm
  shuffled(RHYTHMS.flatMap((r, ri) => MASKS.map((m) => ({ name: `beat ${ri + 1} ${colour(m)}`, steps: r.map((h) => (h ? m : 0)) }))), 11),
  // call and response: the hits of a rhythm alternate between two colours
  shuffled(RHYTHMS.flatMap((r, ri) => GROUPS.flatMap((a) => GROUPS.filter((b) => b !== a && !(a & b)).map((b) => {
    let n = 0;
    return { name: `call ${ri + 1} ${colour(a)}/${colour(b)}`, steps: r.map((h) => (h ? (n++ % 2 ? b : a) : 0)) };
  }))), 22),
  // chases in every order of the lights, in several shapes
  shuffled(PERMS.flatMap((o) => {
    const [a, b, c, d] = o as [number, number, number, number], k = label(o);
    return [
      { name: `pingpong ${k}`, steps: [a, b, c, d, d, c, b, a] },
      { name: `flash chase ${k}`, steps: [a, A, b, A, c, A, d, A] },
      { name: `dark chase ${k}`, steps: rep([A ^ a, A ^ b, A ^ c, A ^ d], 2) },
      { name: `double step ${k}`, steps: [a, a, b, b, c, c, d, d] },
      { name: `stack ${k}`, steps: [a, a | b, a | b | c, A, b | c | d, c | d, d, 0] },
      { name: `pair walk ${k}`, steps: rep([a | b, b | c, c | d, d | a], 2) },
      { name: `half chase ${k}`, steps: [a, b, a, b, c, d, c, d] },
      { name: `echo ${k}`, steps: [a, 0, a, b, 0, b, c, d] },
    ];
  }), 33),
  // mirrored bars: four colours there and back
  Array.from({ length: 220 }, (_, i) => {
    const rnd = random(5000 + i * 31), pick = () => MASKS[Math.floor(rnd() * MASKS.length)]!;
    const half = [pick(), pick(), pick(), pick()];
    return { name: `mirror ${i + 1}`, steps: [...half, ...[...half].reverse()] };
  }),
  // sparkles: random colours with a dark beat for punch
  Array.from({ length: 220 }, (_, i) => {
    const rnd = random(9000 + i * 53);
    const gap = Math.floor(rnd() * 8);
    return { name: `sparkle ${i + 11}`, steps: Array.from({ length: PATTERN_STEPS }, (_, s) => (s === gap ? 0 : 1 + Math.floor(rnd() * 15))) };
  }),
];

/** Take one pattern from each family in turn (so neighbours always look different), skip repeats. */
function takeRoundRobin(families: Pattern[][], count: number, out: Pattern[], seen: Set<string>) {
  const queues = families.map((f) => [...f]);
  while (out.length < count && queues.some((q) => q.length)) {
    for (const q of queues) {
      if (out.length >= count) break;
      // skip repeats and patterns with fewer than two lit steps
      let p = q.shift();
      while (p && (seen.has(p.steps.join(",")) || p.steps.filter(Boolean).length < 2)) p = q.shift();
      if (!p) continue;
      seen.add(p.steps.join(","));
      out.push(p);
    }
  }
}

function buildPatterns(): Pattern[] {
  const out: Pattern[] = [], seen = new Set<string>();
  takeRoundRobin(FAMILIES, FIRST_COUNT, out, seen);
  takeRoundRobin(EXTRA_FAMILIES, PATTERN_COUNT, out, seen);
  return out;
}

export const SHOW_PATTERNS: Pattern[] = buildPatterns();
export const SHOW_STEPS: number[] = SHOW_PATTERNS.flatMap((p) => p.steps);

export function showLights(mask: number) {
  return { SL: !!(mask & W), BL: !!(mask & Y), GR: !!(mask & G), RD: !!(mask & R) };
}
