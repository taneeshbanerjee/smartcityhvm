import { BookOpen, Download, RefreshCw, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { NUS_SERVICE, NUS_WRITE, NUS_NOTIFY } from "@/lib/smartcity";
import { buildDiagnosticsReport, getRecoverySteps } from "@/lib/recovery-guidance";
import type { TransportDiagnostics, TransportError } from "@/lib/transport";

const commands = [
  ["SL:1 / SL:0", "Street lights on / off"],
  ["BL:1 / BL:0", "Building lights on / off"],
  ["GR:1 / GR:0", "Green status lights on / off"],
  ["RD:1 / RD:0", "Red beacons on / off"],
  ["WT:1 / WT:0", "Wind turbine on / off: the one motor on L298N OUT1/OUT2 turns slowly at 10% speed (a 0.3 s full-power start, then 10%)."],
  [
    "AUTO:1 / AUTO:0",
    "Enable / disable sensor-controlled street and building lights (on when the ESP32 starts). AUTO:1 also re-learns the room's light, so send it with the sensor uncovered. SL or BL by hand turns Auto off.",
  ],
  [
    "THR:0 / THR:1500",
    "Light threshold. THR:0 = automatic (default): lights on when the sensor drops below 70% of the room's light, off above 80%. THR:1–4095 = fixed: lights on below it, off above it.",
  ],
  [
    "ALL:0",
    "Turn off all six outputs and disable Auto. The app also stops its Show sequence.",
  ],
  ["SCENE:day", "Request Day scene."],
  ["SCENE:night", "Request Night scene."],
  ["SCENE:eco", "Request Eco scene."],
  [
    "SCENE:show",
    "Start the stage light show. The ESP32 runs it itself (no Bluetooth delay): 128 BPM, a new step every half beat, one bar each of 1 lakh (100,000) different light variations (about 52 hours), turbines on, looping until stopped.",
  ],
  ["SHOW:0", "Stop the show; the city returns to how it was before. Any other command also ends the show first."],
  ["MB:120", "Start a new party song at this tempo (60–180 BPM). The ESP32 uses the song only for its beat; the phone plays it."],
  ["MA:3C044004", "Add up to 15 song notes, 4 hex digits each: MIDI note (00 = rest), then length in 16th notes."],
  ["MP:1 / MP:0", "Start / stop party mode: the phone plays the song and the lights follow it note by note (a step per note, dark on rests, the next of the 1 lakh variations every bar), then the city is restored."],
  ["GET", "Request current output states, Auto state, party state, LDR reading and light threshold."],
];

export function TestingTools({
  supported,
  connection,
  name,
  demo,
  diagnostics,
  errors,
  recentReplies,
  onRequestStatus,
}: {
  supported: boolean;
  connection: string;
  name: string;
  demo: boolean;
  diagnostics: TransportDiagnostics;
  errors: TransportError[];
  recentReplies: { text: string; time: string }[];
  onRequestStatus: () => void;
}) {
  const recoverySteps = getRecoverySteps(supported, connection, demo, errors[0]);
  const downloadReport = () => {
    const report = buildDiagnosticsReport({
      generatedAt: new Date().toLocaleString(),
      supported,
      connection: demo ? "Connected (Demo)" : connection,
      device: connection === "disconnected" ? "None connected" : name || "Not selected",
      diagnostics,
      errors,
      recentReplies,
      recoverySteps,
    });
    const url = URL.createObjectURL(new Blob([report], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `smartcity-bluetooth-report-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };
  return (
    <div className="grid grid-cols-2 gap-2">
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline" className="h-11 px-2">
            <BookOpen />
            Command reference
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[85dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-lg p-4 sm:p-6">
          <DialogHeader className="pr-7 text-left">
            <DialogTitle className="font-display tracking-normal">
              ESP32 command reference
            </DialogTitle>
            <DialogDescription>
              Nordic UART · UTF-8 · one command per line, ending with a newline (\n).
            </DialogDescription>
          </DialogHeader>
          <dl className="divide-y divide-border">
            {commands.map(([command, effect]) => (
              <div key={command} className="grid gap-1 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
                <dt className="font-mono text-sm font-semibold text-primary">{command}</dt>
                <dd className="text-sm text-foreground">{effect}</dd>
              </div>
            ))}
          </dl>
          <section className="space-y-2 border-t border-border pt-4">
            <h3 className="font-semibold">Device replies</h3>
            <code className="block break-all rounded-md bg-muted p-3 text-xs">
              ST:SL=1,BL=1,GR=0,RD=0,WT=0,AUTO=1,MU=0,SH=0,DK=1;LDR=732,THR=0,LON=1680
            </code>
            <p className="text-sm text-muted-foreground">
              Output, Auto, MU (party) and SH (show) values: 0 = off, 1 = on. DK = 1 when the sensor sees dark. LDR: sensor
              reading (0 dark – 4095 bright). THR: threshold setting (0 = automatic). LON: lights come on below this. Other
              replies, including OK acknowledgements, appear in the Activity log.
            </p>
            <p className="text-sm text-muted-foreground">
              These are the commands used by this app. Physical effects and scene presets depend on
              the ESP32 firmware; Demo mode does not verify hardware.
            </p>
          </section>
        </DialogContent>
      </Dialog>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline" className="h-11 px-2">
            <Stethoscope />
            Diagnostics
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[85dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-lg p-4 sm:p-6">
          <DialogHeader className="pr-7 text-left">
            <DialogTitle className="font-display tracking-normal">Pairing diagnostics</DialogTitle>
            <DialogDescription>
              Live connection checks · errors retained for this app session.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={downloadReport}>
              <Download /> Download report
            </Button>
          </div>
          <dl className="divide-y divide-border text-sm">
            {[
              ["Web Bluetooth", supported ? "Supported" : "Not supported"],
              ["Connection", demo ? "Connected (Demo)" : connection],
              ["Device", connection === "disconnected" ? "None connected" : name || "Not selected"],
              ["Transport stage", diagnostics.stage],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 py-2">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="text-right capitalize">{value}</dd>
              </div>
            ))}
          </dl>
          <section>
            <h3 className="mb-2 font-semibold">Nordic UART availability</h3>
            <dl className="divide-y divide-border">
              {[
                ["Service", NUS_SERVICE, diagnostics.service],
                ["Write characteristic", NUS_WRITE, diagnostics.write],
                ["Notify characteristic", NUS_NOTIFY, diagnostics.notify],
              ].map(([label, uuid, status]) => (
                <div key={label} className="py-3">
                  <div className="flex justify-between gap-3 text-sm">
                    <dt>{label}</dt>
                    <dd className="text-right font-semibold capitalize">{status}</dd>
                  </div>
                  <dd className="mt-1 break-all font-mono text-xs text-muted-foreground">{uuid}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-3 py-3 text-sm">
                <dt>Notifications</dt>
                <dd className="font-semibold capitalize">{diagnostics.notifications}</dd>
              </div>
            </dl>
            {demo && (
              <p className="text-sm text-muted-foreground">
                Simulated only. No Bluetooth service or characteristic has been checked.
              </p>
            )}
            {!supported && (
              <p className="text-sm text-muted-foreground">
                Use Chrome on Android or a supported desktop browser over HTTPS. Safari on iPhone
                and Firefox do not support Web Bluetooth.
              </p>
            )}
          </section>
          <section className="space-y-2 border-t border-border pt-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold">Recent device responses</h3>
              <Button
                variant="outline"
                size="sm"
                disabled={connection !== "connected" || demo}
                onClick={onRequestStatus}
              >
                <RefreshCw /> Request status
              </Button>
            </div>
            {recentReplies.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No device replies received this session.
              </p>
            ) : (
              <ol className="max-h-44 space-y-2 overflow-y-auto">
                {recentReplies.map((reply, i) => (
                  <li key={`${reply.time}-${i}`} className="rounded-md bg-muted p-2">
                    <p className="text-xs text-muted-foreground">{reply.time}</p>
                    <code className="block break-all text-xs">{reply.text}</code>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <section className="space-y-2 border-t border-border pt-4">
            <h3 className="font-semibold">Recovery steps</h3>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              {recoverySteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>
          <section className="border-t border-border pt-4">
            <h3 className="mb-2 font-semibold">Recent transport errors</h3>
            {errors.length === 0 ? (
              <p className="text-sm text-muted-foreground">No transport errors recorded.</p>
            ) : (
              <ol className="space-y-3">
                {errors.map((error, i) => (
                  <li key={i} className="border-l-2 border-destructive pl-3 text-sm">
                    <p className="text-xs text-muted-foreground">
                      {error.time} · {error.stage}
                    </p>
                    <p className="break-words font-semibold text-destructive">{error.name}</p>
                    <p className="break-words">{error.message}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </DialogContent>
      </Dialog>
    </div>
  );
}
