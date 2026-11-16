import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dices, Headphones, Loader2, PartyPopper, Square, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { composePartyMusic } from "@/lib/ai-party-music.functions";
import { SunoPromptPanel } from "@/components/suno-prompt-panel";
import {
  buildMinuteSong,
  composeBuiltInMotif,
  playSongOnPhone,
  SONG_SECONDS,
  songCommands,
  type PartySong,
  type SongPlayback,
} from "@/lib/party-music";

const MAX_LENGTH = 300;

export function PartyModePanel({ connected, demo, musicPlaying, onStart, onStop }: {
  connected: boolean;
  demo: boolean;
  /** MU reported by the ESP32 (or demo): the buzzer is playing. */
  musicPlaying: boolean;
  /** Send the commands in order; rejects if one can't be sent. */
  onStart: (commands: string[]) => Promise<void>;
  onStop: () => Promise<void>;
}) {
  const compose = useServerFn(composePartyMusic);
  const [description, setDescription] = useState("");
  const [song, setSong] = useState<PartySong | null>(null);
  const [busy, setBusy] = useState<"composing" | "starting" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [previewing, setPreviewing] = useState(false);
  const playback = useRef<SongPlayback | null>(null);

  const stopPhone = () => {
    playback.current?.stop();
    playback.current = null;
    setPreviewing(false);
  };
  useEffect(() => () => playback.current?.stop(), []);

  const playOnPhone = (track: PartySong) => {
    stopPhone();
    const p = playSongOnPhone(track);
    if (!p) { toast.error("This browser can't play audio."); return; }
    playback.current = p;
    setPreviewing(true);
    void p.done.then(() => { if (playback.current === p) { playback.current = null; setPreviewing(false); } });
  };

  const elapsed = startedAt === null ? 0 : (now - startedAt) / 1000;
  useEffect(() => {
    if (startedAt === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [startedAt]);
  // The party ends after a minute, or earlier if the city reports the music has stopped.
  useEffect(() => {
    if (startedAt === null) return;
    if (elapsed >= SONG_SECONDS + 1 || (elapsed > 3 && !musicPlaying)) { setStartedAt(null); stopPhone(); }
  }, [elapsed, musicPlaying, startedAt]);
  useEffect(() => { if (!connected && startedAt !== null) { setStartedAt(null); stopPhone(); } }, [connected, startedAt]);

  const chooseSong = (next: PartySong) => {
    if (startedAt !== null) return;
    stopPhone();
    setSong(next);
  };

  const composeWithAI = async () => {
    if (busy) return;
    setBusy("composing");
    setError(null);
    try {
      const result = await compose({ data: { description: description.trim() } });
      if (result.ok) chooseSong(buildMinuteSong(result.motif, "ai"));
      else setError(result.error);
    } catch {
      setError("Could not reach the music service. Check your connection, or use a built-in tune.");
    } finally {
      setBusy(null);
    }
  };

  const builtIn = () => {
    setError(null);
    chooseSong(buildMinuteSong(composeBuiltInMotif(Date.now()), "built-in"));
  };

  const start = async () => {
    if (!song || !connected || busy) return;
    setBusy("starting");
    stopPhone();
    try {
      await onStart(songCommands(song));
      setNow(Date.now());
      setStartedAt(Date.now());
      // In demo mode there's no robot, so the phone plays what its buzzer would play.
      if (demo) playOnPhone(song);
      toast.success(`Party started: “${song.title}”`);
    } catch {
      toast.error("Couldn't send the song to the city. Check the Bluetooth connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  const stop = async () => {
    stopPhone();
    setStartedAt(null);
    try { await onStop(); } catch { toast.error("Couldn't reach the city to stop the party."); }
  };

  const partyOn = startedAt !== null;
  const remaining = Math.max(0, Math.ceil(SONG_SECONDS - elapsed));

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Describe the mood, then make a full song with Suno for the karaoke speaker, or a 1-minute tune the robot plays on its buzzer while the city's lights flash to the beat.
      </p>
      <label htmlFor="party-music-mood" className="sr-only">Describe the party music</label>
      <Textarea
        id="party-music-mood"
        value={description}
        maxLength={MAX_LENGTH}
        rows={2}
        placeholder="Optional: the mood, e.g. upbeat Bollywood dance, festival drums, happy birthday vibe"
        onChange={(event) => setDescription(event.target.value)}
        className="glass-control resize-none"
      />
      <SunoPromptPanel mood={description} />
      <p className="pt-1 text-sm font-semibold">Buzzer tune for the robot</p>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Button onClick={() => { void composeWithAI(); }} disabled={busy !== null || partyOn} className="h-11 rounded-xl">
          {busy === "composing" ? <Loader2 className="animate-spin" /> : <WandSparkles />}
          {busy === "composing" ? "Composing…" : "Compose with AI"}
        </Button>
        <Button variant="ghost" onClick={builtIn} disabled={busy !== null || partyOn} className="glass-control h-11 rounded-xl">
          <Dices /> Built-in tune
        </Button>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error} <button type="button" onClick={builtIn} className="font-semibold underline">Use a built-in tune</button>
        </p>
      )}

      {song && (
        <div className="space-y-3 rounded-2xl border border-border/60 p-3" aria-live="polite">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{song.source === "ai" ? "Composed by AI" : "Built-in tune"}</p>
              <h3 className="truncate font-display font-semibold">{song.title}</h3>
            </div>
            <span className="shrink-0 rounded-full border border-border/60 px-2 py-0.5 text-xs font-semibold tabular-nums">{song.bpm} BPM · 1:00</span>
          </div>
          <MelodyStrip song={song} />
          {partyOn && (
            <div className="space-y-1">
              <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Party progress"
                aria-valuemin={0} aria-valuemax={SONG_SECONDS} aria-valuenow={Math.min(SONG_SECONDS, Math.round(elapsed))}>
                <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${Math.min(100, (elapsed / SONG_SECONDS) * 100)}%` }} />
              </div>
              <p className="text-xs tabular-nums text-muted-foreground">Party on — {remaining}s left</p>
            </div>
          )}
          <div className="flex gap-2">
            {partyOn ? (
              <Button onClick={() => { void stop(); }} variant="destructive" className="h-11 flex-1 rounded-xl"><Square /> Stop party</Button>
            ) : (
              <Button onClick={() => { void start(); }} disabled={!connected || busy !== null} className="h-11 flex-1 rounded-xl">
                {busy === "starting" ? <Loader2 className="animate-spin" /> : <PartyPopper />}
                {busy === "starting" ? "Sending song…" : "Start party"}
              </Button>
            )}
            {!partyOn && (
              <Button variant="ghost" onClick={() => (previewing ? stopPhone() : playOnPhone(song))} className="glass-control h-11 rounded-xl">
                {previewing ? <Square /> : <Headphones />} {previewing ? "Stop" : "Listen on phone"}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {!connected ? "Connect to the city or start Demo mode to start the party." :
              demo ? "Demo mode: the phone plays what the robot's buzzer would play." :
                "The song is sent to the robot first, then it plays on the buzzer (GPIO 23) by itself."}
          </p>
        </div>
      )}
    </div>
  );
}

/** The first four bars (the hook) as a small piano roll. */
function MelodyStrip({ song }: { song: PartySong }) {
  const bars = 4;
  const width = bars * 16;
  const notes: { x: number; w: number; pitch: number }[] = [];
  let x = 0;
  for (const note of song.notes) {
    if (x >= width) break;
    if (note.pitch > 0) notes.push({ x, w: note.sixteenths, pitch: note.pitch });
    x += note.sixteenths;
  }
  const pitches = notes.map((n) => n.pitch);
  const low = Math.min(...pitches, 72);
  const high = Math.max(...pitches, low + 12);
  const y = (pitch: number) => 26 - ((pitch - low) / (high - low)) * 22;
  return (
    <svg viewBox={`0 0 ${width} 30`} className="h-12 w-full" role="img" aria-label="Melody of the first four bars">
      {[16, 32, 48].map((bar) => <line key={bar} x1={bar} x2={bar} y1={0} y2={30} className="stroke-border" strokeWidth={0.3} />)}
      {notes.map((n, i) => <rect key={i} x={n.x + 0.2} y={y(n.pitch) - 1.2} width={Math.max(0.6, n.w - 0.4)} height={2.4} rx={0.8} className="fill-primary" />)}
    </svg>
  );
}
