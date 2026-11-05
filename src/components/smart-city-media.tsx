import { useCallback, useEffect, useRef, useState } from "react";
import { Bluetooth, Headphones, Music2 } from "lucide-react";
import { toast } from "sonner";
import descriptionAudio from "@/assets/smart-city-description.mp3.asset.json";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type AudioOutput = { deviceId: string; label: string };
type OutputAudio = HTMLAudioElement & { setSinkId?: (sinkId: string) => Promise<void> };

export function SmartCityMedia() {
  const audioRef = useRef<OutputAudio | null>(null);
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
    const player = audioRef.current;
    if (!player?.setSinkId) {
      toast.info("This browser uses the device's current audio output.");
      return;
    }
    try {
      await player.setSinkId(deviceId === "default" ? "" : deviceId);
      toast.success("Description audio output updated.");
    } catch {
      setSelectedOutput("default");
      toast.error("Could not select that audio output. Pair the karaoke speaker and try again.");
    }
  };

  return (
    <section className="space-y-3 rounded-3xl border border-border bg-card p-4 shadow-card">
      <h2 className="flex items-center gap-2 font-display font-semibold"><Music2 className="text-primary" size={18} />Smart City Description</h2>
      <audio ref={audioRef} className="w-full" controls preload="metadata" src={descriptionAudio.url} aria-label="Smart City Description audio" />
      <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
        <label className="flex items-center gap-2 text-sm font-medium" htmlFor="description-audio-output"><Headphones size={16} /> Audio output</label>
        <Select value={selectedOutput} onValueChange={chooseOutput}>
          <SelectTrigger id="description-audio-output" aria-label="Choose description audio output" disabled={!canChooseOutput} className="sm:w-64">
            <SelectValue placeholder="Use device output" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Device default</SelectItem>
            {outputs.filter((output) => output.deviceId && output.deviceId !== "default").map((output) => (
              <SelectItem key={output.deviceId} value={output.deviceId}>{output.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {!canChooseOutput && <p className="text-xs text-muted-foreground">To play through karaoke, pair it in your device’s Bluetooth settings and select it as the device audio output. Direct output selection is not available in this browser.</p>}
      {canChooseOutput && <p className="flex items-start gap-2 text-xs text-muted-foreground"><Bluetooth size={14} className="mt-0.5 shrink-0" />Pair the karaoke speaker in Bluetooth settings first; available outputs appear here when supported.</p>}
      <Button variant="outline" size="sm" onClick={loadOutputs}>Refresh audio outputs</Button>
    </section>
  );
}