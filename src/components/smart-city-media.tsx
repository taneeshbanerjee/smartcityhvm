import { useCallback, useEffect, useRef, useState } from "react";
import { Bluetooth, Download, Headphones, Music2 } from "lucide-react";
import { toast } from "sonner";
import descriptionAudio from "@/assets/smart-city-description.mp3.asset.json";
import { Button } from "@/components/ui/button";
import { THEME_SONG } from "@/lib/theme-song";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type AudioOutput = { deviceId: string; label: string };
type OutputAudio = HTMLAudioElement & { setSinkId?: (sinkId: string) => Promise<void> };
type SelectableMediaDevices = MediaDevices & { selectAudioOutput?: () => Promise<MediaDeviceInfo> };

export function SmartCityMedia() {
  const audioRef = useRef<OutputAudio | null>(null);
  const themeRef = useRef<OutputAudio | null>(null);
  const [outputs, setOutputs] = useState<AudioOutput[]>([]);
  const [selectedOutput, setSelectedOutput] = useState("default");
  const [canChooseOutput, setCanChooseOutput] = useState(false);

  const loadOutputs = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setOutputs(devices.filter((device) => device.kind === "audiooutput").map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `Audio output ${index + 1}`,
      })));
      setCanChooseOutput(typeof audioRef.current?.setSinkId === "function");
    } catch {
      setCanChooseOutput(false);
    }
  }, []);

  useEffect(() => {
    void loadOutputs();
    navigator.mediaDevices?.addEventListener?.("devicechange", loadOutputs);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", loadOutputs);
  }, [loadOutputs]);

  const chooseOutput = async (deviceId: string) => {
    setSelectedOutput(deviceId);
    // The theme song and the description recording share one output.
    const players = [themeRef.current, audioRef.current].filter((player): player is OutputAudio => !!player?.setSinkId);
    if (players.length === 0) {
      toast.info("This browser uses the device's current audio output.");
      return;
    }
    try {
      await Promise.all(players.map((player) => player.setSinkId!(deviceId === "default" ? "" : deviceId)));
      toast.success("Audio output updated.");
    } catch {
      setSelectedOutput("default");
      toast.error("Could not select that audio output. Pair the karaoke speaker and try again.");
    }
  };

  const chooseKaraokeOutput = async () => {
    const devices = navigator.mediaDevices as SelectableMediaDevices | undefined;
    if (!devices?.selectAudioOutput) {
      toast.info("Pair the karaoke speaker in your device’s Bluetooth settings, then choose it as the device audio output.");
      return;
    }
    try {
      const output = await devices.selectAudioOutput();
      await chooseOutput(output.deviceId);
      setOutputs((existing) => existing.some((entry) => entry.deviceId === output.deviceId)
        ? existing
        : [...existing, { deviceId: output.deviceId, label: output.label || "Bluetooth karaoke speaker" }]);
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError") return;
      toast.error("Could not select the karaoke speaker. Pair it in Bluetooth settings and try again.");
    }
  };

  // Only one recording plays at a time.
  const onPlay = (playing: "theme" | "description") => {
    (playing === "theme" ? audioRef.current : themeRef.current)?.pause();
    if (playing === "theme" && "mediaSession" in navigator && typeof MediaMetadata !== "undefined") {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: THEME_SONG.title,
        artist: "Smart City theme song",
        album: "Hariyana Vidya Mandir Smart City",
        artwork: [{ src: THEME_SONG.cover, sizes: "360x360", type: "image/jpeg" }],
      });
    }
  };

  return (
    <section className="space-y-3 rounded-2xl glass-panel p-4 md:p-5">
      <h2 className="flex items-center gap-2 font-display font-semibold"><Music2 className="text-primary" size={18} />Smart City Theme Song</h2>
      <div className="flex items-center gap-3">
        <img src={THEME_SONG.cover} alt="Smart City Dawn cover art" width={360} height={360} className="h-16 w-16 shrink-0 rounded-xl object-cover shadow-card" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg font-semibold">{THEME_SONG.title}</p>
          <p className="text-xs text-muted-foreground">Theme song · {THEME_SONG.length}</p>
        </div>
        <Button variant="ghost" size="icon" asChild className="glass-control shrink-0 rounded-full">
          <a href={THEME_SONG.url} download={THEME_SONG.fileName} aria-label="Download the Smart City theme song"><Download /></a>
        </Button>
      </div>
      <audio ref={themeRef} className="w-full" controls preload="metadata" src={THEME_SONG.url} onPlay={() => onPlay("theme")} aria-label="Smart City theme song, Smart City Dawn" />
      <h3 className="pt-1 text-sm font-semibold">Smart City Description</h3>
      <audio ref={audioRef} className="w-full" controls preload="metadata" src={descriptionAudio.url} onPlay={() => onPlay("description")} aria-label="Smart City Description audio" />
      <label className="flex items-center gap-2 text-sm font-medium" htmlFor="description-audio-output"><Headphones size={16} /> Audio output for the theme song and description</label>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <Select value={selectedOutput} onValueChange={chooseOutput}>
        <SelectTrigger id="description-audio-output" aria-label="Choose description audio output" disabled={!canChooseOutput} className="glass-control">
            <SelectValue placeholder="Use device output" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Device default</SelectItem>
            {outputs.filter((output) => output.deviceId && output.deviceId !== "default").map((output) => (
              <SelectItem key={output.deviceId} value={output.deviceId}>{output.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" className="glass-control" onClick={chooseKaraokeOutput}><Bluetooth /> Choose Bluetooth karaoke</Button>
      </div>
      {!canChooseOutput && <p className="text-xs text-muted-foreground">To play through karaoke, pair it in your device’s Bluetooth settings and select it as the device audio output. Direct output selection is not available in this browser.</p>}
      {canChooseOutput && <p className="flex items-start gap-2 text-xs text-muted-foreground"><Bluetooth size={14} className="mt-0.5 shrink-0" />Pair the karaoke speaker in Bluetooth settings first. If the browser offers it, Choose Bluetooth karaoke can route these recordings directly; the voice agent follows the device audio output.</p>}
      <Button variant="ghost" size="sm" className="glass-control" onClick={loadOutputs}>Refresh audio outputs</Button>
    </section>
  );
}