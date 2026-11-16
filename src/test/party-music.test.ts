import { describe, expect, it } from "vitest";
import {
  buildMinuteSong, composeBuiltInMotif, MAX_PITCH, MAX_SONG_NOTES, MIN_PITCH, normalizeMotif, songCommands, songSeconds,
} from "@/lib/party-music";

const motif = { title: "Test Groove", bpm: 120, notes: [{ pitch: 72, sixteenths: 4 }, { pitch: 0, sixteenths: 2 }, { pitch: 76, sixteenths: 6 }, { pitch: 79, sixteenths: 4 }] };

function decode(commands: string[]) {
  const notes: { pitch: number; sixteenths: number }[] = [];
  for (const c of commands.filter((x) => x.startsWith("MA:"))) {
    const v = c.slice(3);
    for (let i = 0; i < v.length; i += 4) notes.push({ pitch: parseInt(v.slice(i, i + 2), 16), sixteenths: parseInt(v.slice(i + 2, i + 4), 16) });
  }
  return notes;
}

describe("party music", () => {
  it("loops the melody to exactly one minute at every tempo", () => {
    for (const bpm of [90, 113, 120, 137, 150]) {
      const song = buildMinuteSong({ ...motif, bpm }, "ai");
      expect(songSeconds(song)).toBeCloseTo(60, 6);
      expect(song.notes.length).toBeLessThanOrEqual(MAX_SONG_NOTES);
    }
  });

  it("encodes the song as firmware commands that fit the ESP32's 64-character lines", () => {
    const song = buildMinuteSong(motif, "ai");
    const commands = songCommands(song);
    expect(commands[0]).toBe("MB:120");
    expect(commands.at(-1)).toBe("MP:1");
    expect(commands.every((c) => c.length <= 64)).toBe(true);
    expect(decode(commands)).toEqual(song.notes);
  });

  it("folds notes into the buzzer's range, clamps tempo and lengths, and rejects unusable melodies", () => {
    const m = normalizeMotif({ title: " Loud ", bpm: 400, notes: [{ pitch: 30, sixteenths: 1 }, { pitch: 120, sixteenths: 40 }, { pitch: 0, sixteenths: 4 }, { pitch: 72, sixteenths: 4 }] });
    expect(m).toEqual({ title: "Loud", bpm: 150, notes: [{ pitch: 66, sixteenths: 2 }, { pitch: 96, sixteenths: 16 }, { pitch: 0, sixteenths: 4 }, { pitch: 72, sixteenths: 4 }] });
    expect(normalizeMotif({ ...motif, notes: motif.notes.map((n) => ({ ...n, pitch: 0 })) })).toBeNull();
    expect(normalizeMotif({ ...motif, notes: [{ pitch: "C4", sixteenths: 4 }] })).toBeNull();
    expect(normalizeMotif({ title: "x", bpm: 120, notes: motif.notes })).toBeNull();
  });

  it("composes valid four-bar built-in tunes for any seed", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const m = normalizeMotif(composeBuiltInMotif(seed * 7919));
      expect(m).not.toBeNull();
      expect(m!.notes.reduce((sum, n) => sum + n.sixteenths, 0)).toBe(64);
      expect(m!.notes.every((n) => n.pitch === 0 || (n.pitch >= MIN_PITCH && n.pitch <= MAX_PITCH))).toBe(true);
    }
  });
});
