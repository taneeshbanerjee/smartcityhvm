/**
 * Party mode music: a short melody (from Lovable AI or the built-in composer) is looped to exactly
 * one minute. The phone plays it, and its notes are sent to the ESP32, which keeps the song's beat and
 * flashes the city lights to it.
 *
 * Protocol (see the firmware header): MB:<bpm> starts a song, MA:<notes> adds up to 15 notes
 * (4 hex digits each: MIDI note, 00 = rest, then length in 16th notes), MP:1 / MP:0 start / stop.
 */

export const SONG_SECONDS = 60;
export const MIN_BPM = 90;
export const MAX_BPM = 150;
/** A square-wave tune sounds clear between about C4 and C7. */
export const MIN_PITCH = 60;
export const MAX_PITCH = 96;
const NOTES_PER_LINE = 15;
/** Must stay at or below the firmware's MAX_NOTES (400). */
export const MAX_SONG_NOTES = 400;

export type SongNote = { pitch: number; sixteenths: number };
export type PartyMotif = { title: string; bpm: number; notes: SongNote[] };
export type PartySong = PartyMotif & { source: "ai" | "built-in" };

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** Fold a MIDI note into the tune's range by octaves; 0 stays a rest. */
export function foldPitch(pitch: number): number {
  if (!Number.isFinite(pitch) || pitch <= 0) return 0;
  let p = Math.round(pitch);
  while (p < MIN_PITCH) p += 12;
  while (p > MAX_PITCH) p -= 12;
  return p;
}

/** Validate a melody (e.g. from the model) into something playable, or null. */
export function normalizeMotif(value: unknown): PartyMotif | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v["title"] !== "string" || typeof v["bpm"] !== "number" || !Number.isFinite(v["bpm"]) || !Array.isArray(v["notes"])) return null;
  const title = v["title"].trim().slice(0, 60);
  if (title.length < 2 || v["notes"].length < 4 || v["notes"].length > 128) return null;
  const notes: SongNote[] = [];
  for (const item of v["notes"]) {
    if (!item || typeof item !== "object") return null;
    const n = item as Record<string, unknown>;
    if (typeof n["pitch"] !== "number" || typeof n["sixteenths"] !== "number" || !Number.isFinite(n["sixteenths"])) return null;
    notes.push({ pitch: foldPitch(n["pitch"]), sixteenths: clamp(Math.round(n["sixteenths"]), 2, 16) });
  }
  if (!notes.some((note) => note.pitch > 0)) return null;
  return { title, bpm: clamp(Math.round(v["bpm"]), MIN_BPM, MAX_BPM), notes };
}

/** Loop the motif until it lasts exactly one minute (the last note is shortened to fit). */
export function buildMinuteSong(motif: PartyMotif, source: PartySong["source"]): PartySong {
  const total = motif.bpm * 4 * (SONG_SECONDS / 60); // sixteenths in one minute
  const notes: SongNote[] = [];
  let used = 0;
  for (let i = 0; used < total && notes.length < MAX_SONG_NOTES; i++) {
    const note = motif.notes[i % motif.notes.length]!;
    const sixteenths = Math.min(note.sixteenths, total - used);
    notes.push({ pitch: note.pitch, sixteenths });
    used += sixteenths;
  }
  return { title: motif.title, bpm: motif.bpm, notes, source };
}

export function songSeconds(song: Pick<PartySong, "bpm" | "notes">): number {
  return song.notes.reduce((sum, note) => sum + note.sixteenths, 0) * 15 / song.bpm;
}

const hex = (n: number) => n.toString(16).toUpperCase().padStart(2, "0");

/** The ESP32 commands that upload the song and start the party. */
export function songCommands(song: PartySong): string[] {
  const commands = [`MB:${song.bpm}`];
  for (let i = 0; i < song.notes.length; i += NOTES_PER_LINE) {
    commands.push("MA:" + song.notes.slice(i, i + NOTES_PER_LINE).map((n) => hex(n.pitch) + hex(n.sixteenths)).join(""));
  }
  commands.push("MP:1");
  return commands;
}

/* ---------- built-in composer (used when AI isn't available) ---------- */

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

const TITLES = ["City Lights Groove", "Turbine Dance", "Neon Skyline", "Solar Celebration", "Smart City Party", "Powerhouse Beat"];
const PROGRESSIONS = [[0, 7, 9, 5], [0, 5, 7, 5], [9, 5, 0, 7], [0, 9, 5, 7]];
const RHYTHMS = [[4, 2, 2, 4, 4], [2, 2, 4, 2, 2, 4], [4, 4, 2, 2, 4], [2, 2, 2, 2, 4, 4], [6, 2, 4, 4]];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];

/** A catchy 4-bar major-key melody built on a pop chord progression, different for each seed. */
export function composeBuiltInMotif(seed: number): PartyMotif {
  const rnd = random(seed);
  const pick = <T,>(list: T[]) => list[Math.floor(rnd() * list.length)]!;
  const root = 72 + pick([0, 2, 5, 7]);
  const progression = pick(PROGRESSIONS);
  const notes: SongNote[] = [];
  progression.forEach((chord, bar) => {
    const rhythm = bar === 3 ? [4, 4, 8] : pick(RHYTHMS);
    const chordTones = [0, 4, 7].map((step) => chord + step);
    rhythm.forEach((sixteenths, i) => {
      const onBeat = i === 0 || sixteenths >= 4;
      const offset = onBeat ? pick(chordTones) : pick(MAJOR) + (rnd() < 0.3 ? 12 : 0);
      const rest = !onBeat && rnd() < 0.15;
      notes.push({ pitch: rest ? 0 : foldPitch(root + offset), sixteenths });
    });
  });
  return { title: pick(TITLES), bpm: 112 + Math.floor(rnd() * 5) * 4, notes };
}

/* ---------- phone playback (demo mode and previews) ---------- */

export type SongPlayback = { stop: () => void; done: Promise<void> };

type AudioContextConstructor = typeof AudioContext;

/** Play the song with a square wave (a chiptune sound) through the phone's speaker. */
export function playSongOnPhone(song: PartySong): SongPlayback | null {
  const Ctx = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext);
  if (!Ctx) return null;
  const ctx = new Ctx();
  const master = ctx.createGain();
  master.gain.value = 0.12;
  master.connect(ctx.destination);
  const sixteenth = 15 / song.bpm;
  let t = ctx.currentTime + 0.05;
  for (const note of song.notes) {
    const length = note.sixteenths * sixteenth;
    if (note.pitch > 0) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = 440 * 2 ** ((note.pitch - 69) / 12);
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(1, t + 0.005);
      env.gain.setValueAtTime(1, t + length * 0.85);
      env.gain.linearRampToValueAtTime(0, t + length * 0.875);
      osc.connect(env).connect(master);
      osc.start(t);
      osc.stop(t + length * 0.9);
    }
    t += length;
  }
  let finish: () => void = () => {};
  const done = new Promise<void>((resolve) => { finish = resolve; });
  const end = () => {
    window.clearTimeout(timer);
    if (ctx.state !== "closed") ctx.close().catch(() => {});
    finish();
  };
  const timer = window.setTimeout(end, (t - ctx.currentTime) * 1000 + 100);
  ctx.resume().catch(() => {});
  return { done, stop: end };
}
