/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Bluetooth, BluetoothOff, Building2, Fan, Lamp, Leaf, ListTree, Loader2, Mic, MicOff,
  Moon, Power, Radio, Sparkles, Sun, Zap, X, Square, Gauge, Signal, Box, Bot, FileCode2, Maximize, Film, CircuitBoard, Gamepad2, Signpost, PartyPopper, Scissors,
} from "lucide-react";
import { ORG_NAME, initialState, parseStatus, parseVoice, type CityState, type SwitchKey } from "@/lib/smartcity";
import { connectBle, connectDemo, isBleSupported, initialDiagnostics, type Transport, type TransportError } from "@/lib/transport";
import { TestingTools } from "@/components/testing-tools";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { SmartCityMedia } from "@/components/smart-city-media";
import { AIControlPlanPanel } from "@/components/ai-control-plan-panel";
import { PartyModePanel } from "@/components/party-mode-panel";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SmartCity Control — Smart City Control Center" },
      { name: "description", content: `Control the ${ORG_NAME} ESP32 smart-city model over Bluetooth.` },
      { property: "og:title", content: "SmartCity Control" },
      { property: "og:description", content: `Control the ${ORG_NAME} smart-city model over Bluetooth.` },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

type Conn = "disconnected" | "connecting" | "connected";
interface LogItem { id: number; dir: "tx" | "rx" | "info"; text: string; time: string }
type ModelControl = { channel: "smartcity-model-control"; version: 1; type: "state"; theme?: "night" | "day"; angle?: number; presentation?: "background" | "fullscreen" };

const SHOW_STEPS = [
  ["SL:1", "BL:0", "GR:1", "RD:0"], ["WT:1", "RD:1"], ["BL:1", "SL:0"],
  ["GR:0"], ["SL:1", "RD:0", "WT:0"], ["BL:0", "GR:1", "RD:1"],
];

function Index() {
  const [splash, setSplash] = useState(true);
  const [dark, setDark] = useState(false);
  const [conn, setConn] = useState<Conn>("disconnected");
  const [devName, setDevName] = useState("");
  const [demo, setDemo] = useState(false);
  const [state, setState] = useState<CityState>(initialState);
  const [thr, setThr] = useState(1500);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const [showRunning, setShowRunning] = useState(false);
  const [bleOk, setBleOk] = useState(true);
  const [diagnostics, setDiagnostics] = useState(initialDiagnostics);
  const [transportErrors, setTransportErrors] = useState<TransportError[]>([]);
  const [recentReplies, setRecentReplies] = useState<{ text: string; time: string }[]>([]);
  const [voiceOk, setVoiceOk] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [cityView, setCityView] = useState<"night" | "day">("night");
  const [modelFullscreen, setModelFullscreen] = useState(false);
  const tRef = useRef<Transport | null>(null);
  const modelFrameRef = useRef<HTMLIFrameElement | null>(null);
  const showRef = useRef<number | null>(null);
  const logId = useRef(0);

  const sendModelControl = useCallback((control: Omit<ModelControl, "channel" | "version" | "type">) => {
    const message: ModelControl = { channel: "smartcity-model-control", version: 1, type: "state", ...control };
    // The model remains sandboxed without allow-same-origin, so its target origin is opaque.
    modelFrameRef.current?.contentWindow?.postMessage(message, "*");
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setSplash(false), 1400);
    setBleOk(isBleSupported());
    setVoiceOk(!!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition));
    const saved = localStorage.getItem("theme");
    setDark(saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => {
    sendModelControl({ theme: cityView });
  }, [cityView, sendModelControl]);
  useEffect(() => {
    let frame = 0;
    const syncScrollAngle = () => {
      frame = 0;
      if (document.fullscreenElement === modelFrameRef.current) return;
      const maxScroll = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
      const progress = Math.min(1, Math.max(0, window.scrollY / maxScroll));
      sendModelControl({ angle: 0.35 + progress * Math.PI * 2 });
    };
    const scheduleSync = () => {
      if (!frame) frame = window.requestAnimationFrame(syncScrollAngle);
    };
    const onFullscreenChange = () => {
      const fullscreen = document.fullscreenElement === modelFrameRef.current;
      setModelFullscreen(fullscreen);
      sendModelControl({ presentation: fullscreen ? "fullscreen" : "background" });
    };
    window.addEventListener("scroll", scheduleSync, { passive: true });
    window.addEventListener("resize", scheduleSync);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    scheduleSync();
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scheduleSync);
      window.removeEventListener("resize", scheduleSync);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [sendModelControl]);
  useEffect(() => () => {
    if (showRef.current) clearInterval(showRef.current);
    tRef.current?.disconnect();
    window.speechSynthesis?.cancel();
  }, []);

  const log = useCallback((dir: LogItem["dir"], text: string) => {
    setLogs((l) => [{ id: ++logId.current, dir, text, time: new Date().toLocaleTimeString() }, ...l].slice(0, 80));
  }, []);

  const onLine = useCallback((line: string) => {
    setRecentReplies((replies) => [{ text: line, time: new Date().toLocaleTimeString() }, ...replies].slice(0, 20));
    const p = parseStatus(line);
    if (p) setState((s) => ({ ...s, ...p }));
    else log("rx", line);
  }, [log]);

  const stopShow = useCallback(() => {
    if (showRef.current) clearInterval(showRef.current);
    showRef.current = null;
    setShowRunning(false);
  }, []);

  const handlers = {
    onLine,
    onDiagnostics: setDiagnostics,
    onError: (error: TransportError) => {
      setTransportErrors((errors) => [error, ...errors].slice(0, 20));
      log("info", `${error.stage}: ${error.name}: ${error.message}`);
    },
    onDisconnect: (reconnecting: boolean) => {
      stopShow();
      if (reconnecting) { setConn("connecting"); toast.warning("Connection lost — reconnecting…"); log("info", "Disconnected, retrying"); return; }
      stopShow(); setConn("disconnected"); tRef.current = null; setDemo(false); log("info", "Disconnected");
    },
    onReconnected: () => { setConn("connected"); toast.success("Reconnected"); tRef.current?.send("GET").catch(() => toast.error("Status request failed. Check Diagnostics.")); },
  };

  const send = useCallback(async (cmd: string) => {
    const t = tRef.current;
    if (!t) return;
    log("tx", cmd);
    try { await t.send(cmd); } catch (e: any) { toast.error("Send failed: " + (e?.message ?? e)); }
  }, [log]);

  const connect = async (showAll = false) => {
    if (!bleOk) { toast.error("Web Bluetooth isn't supported in this browser. Try Chrome on Android, or use Demo mode."); return; }
    setConn("connecting");
    try {
      const t = await connectBle(showAll, handlers);
      tRef.current = t; setDevName(t.name); setConn("connected"); setDemo(false);
      toast.success(`Connected to ${t.name}`); log("info", "Connected to " + t.name);
      await t.send("GET").catch(() => toast.error("Status request failed. Check Diagnostics."));
    } catch (e: any) {
      setConn("disconnected");
      if (e?.name === "NotFoundError") toast.info("Pairing cancelled or no device found.");
      else if (e?.name === "BluetoothOff") toast.error("Bluetooth is off. Turn it on and try again.");
      else if (e?.name === "NotAllowedError" || e?.name === "SecurityError") toast.error("Bluetooth permission denied.");
      else toast.error("Couldn't connect: " + (e?.message ?? "unknown error"));
    }
  };

  const startDemo = () => {
    tRef.current?.disconnect();
    const t = connectDemo(handlers);
    tRef.current = t; setDemo(true); setDevName(t.name); setConn("connected");
    toast.success("Demo mode started"); log("info", "Demo mode");
  };

  const disconnect = () => { stopShow(); tRef.current?.disconnect(); };

  const startShow = () => {
    stopShow(); setShowRunning(true); send("SCENE:show");
    let i = 0;
    showRef.current = window.setInterval(() => {
      (SHOW_STEPS[i % SHOW_STEPS.length] ?? []).forEach((c) => send(c)); i++;
    }, 1500);
  };

  const scene = (s: string) => { if (s === "show") return startShow(); stopShow(); send("SCENE:" + s); };
  const allOff = () => { stopShow(); send("ALL:0"); };
  const applyPlan = async (commands: string[]) => {
    stopShow();
    for (const command of commands) await send(command);
  };
  // Like applyPlan, but stops at the first command that fails so a half-sent song never starts.
  const sendSong = async (commands: string[]) => {
    stopShow();
    const t = tRef.current;
    if (!t) throw new Error("Not connected");
    for (const command of commands) { log("tx", command); await t.send(command); }
  };
  const toggle = (k: SwitchKey | "AUTO") => send(`${k}:${state[k] ? 0 : 1}`);
  const openModelFullscreen = async () => {
    const frame = modelFrameRef.current;
    if (!frame?.requestFullscreen) {
      toast.info("Full-screen viewing isn't available in this browser.");
      return;
    }
    try {
      await frame.requestFullscreen();
    } catch {
      toast.error("Couldn't open the model full screen. Check your browser permissions.");
    }
  };
  const onModelLoad = () => {
    sendModelControl({ theme: cityView, presentation: modelFullscreen ? "fullscreen" : "background" });
    const maxScroll = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
    const progress = Math.min(1, Math.max(0, window.scrollY / maxScroll));
    sendModelControl({ angle: 0.35 + progress * Math.PI * 2 });
  };

  const speak = (text: string) => {
    if (!("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(text); u.lang = "en-IN";
    window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
  };

  const listen = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    if (!navigator.onLine) toast.warning("Voice recognition needs an internet connection.");
    const r = new SR(); r.lang = "en-IN"; r.interimResults = false; r.maxAlternatives = 1;
    r.onstart = () => setListening(true);
    r.onend = () => setListening(false);
    r.onerror = (e: any) => {
      setListening(false);
      if (e.error === "not-allowed" || e.error === "service-not-allowed") toast.error("Microphone permission denied. Allow mic access in browser settings.");
      else if (e.error === "network") toast.error("Voice needs internet. Check your connection.");
      else if (e.error === "no-speech") toast.info("Didn't hear anything — try again.");
      else toast.error("Voice error: " + e.error);
    };
    r.onresult = (e: any) => {
      const text: string = e.results[0][0].transcript;
      setTranscript(text);
      const m = parseVoice(text);
      if (!m) { speak("Sorry, I didn't understand"); return; }
      if (conn !== "connected") { speak("Please connect to the city first"); return; }
      if (m.show) startShow(); else { stopShow(); m.cmds.forEach(send); }
      speak(m.reply);
    };
    try { r.start(); } catch { /* already started */ }
  };

  const disabled = conn !== "connected";

  if (splash) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background">
        <img src="/logo.png" alt={`${ORG_NAME} logo`} className="h-40 w-auto animate-splash" />
        <div className="text-center animate-splash">
          <p className="text-sm font-semibold text-muted-foreground">{ORG_NAME}</p>
          <h1 className="font-display text-2xl font-bold text-primary">Smart City Control</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen pb-28 font-sans text-foreground">
      <iframe
        ref={modelFrameRef}
        title="Smart City night view background"
        src="/smart-city-model/index.html?background=1"
        sandbox="allow-scripts allow-pointer-lock"
        allowFullScreen
        aria-hidden="true"
        onLoad={onModelLoad}
        className={`fixed inset-0 z-0 h-dvh w-full border-0 transition-opacity duration-700 ${cityView === "night" ? "opacity-60" : "opacity-40"} ${modelFullscreen ? "pointer-events-auto" : "pointer-events-none"}`}
      />
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/65 px-4 py-3 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <img src="/logo.png" alt={`${ORG_NAME} logo`} className="h-11 w-auto" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-accent">{ORG_NAME}</p>
            <h1 className="truncate font-display text-lg font-bold leading-tight">Smart City Control Center</h1>
          </div>
          <IconBtn label="Toggle theme" onClick={() => setDark((d) => !d)}>{dark ? <Sun size={20} /> : <Moon size={20} />}</IconBtn>
          <IconBtn label="Activity log" onClick={() => setLogOpen(true)}><ListTree size={20} /></IconBtn>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-5xl space-y-5 px-4 py-5 md:space-y-6 md:py-7">
        <section className="rounded-3xl glass-hero p-4 text-primary-foreground md:p-6">
          <div className="flex items-center justify-between gap-2">
            <Chip conn={conn} name={devName} />
            {voiceOk && (
              <button aria-label="Voice command" onClick={listen}
                className={`grid h-12 w-12 place-items-center rounded-full border border-primary-foreground/20 bg-primary-foreground/15 backdrop-blur-xl transition active:scale-95 ${listening ? "animate-pulse ring-4 ring-accent" : ""}`}>
                {listening ? <MicOff size={22} /> : <Mic size={22} />}
              </button>
            )}
          </div>
          {transcript && <p className="mt-3 rounded-xl bg-primary-foreground/10 px-3 py-2 text-sm">“{transcript}”</p>}
          <div className="mt-4 grid grid-cols-2 gap-2">
            {conn === "connected" ? (
              <button onClick={disconnect} className="col-span-2 h-12 rounded-2xl border border-primary-foreground/20 bg-primary-foreground/15 font-semibold backdrop-blur-xl active:scale-[.98]">
                {demo ? "Exit demo" : "Disconnect"}
              </button>
            ) : (
              <>
                <button disabled={conn === "connecting" || !bleOk} onClick={() => connect(false)}
                className="col-span-2 flex h-14 items-center justify-center gap-2 rounded-2xl border border-primary-foreground/25 bg-primary/45 text-lg font-bold text-primary-foreground shadow-card backdrop-blur-xl disabled:opacity-60 active:scale-[.98]">
                  {conn === "connecting" ? <Loader2 className="animate-spin" /> : <Bluetooth />} Connect
                </button>
                <button disabled={!bleOk || conn === "connecting"} onClick={() => connect(true)} className="h-11 rounded-2xl border border-primary-foreground/20 bg-primary-foreground/15 text-sm font-semibold backdrop-blur-xl disabled:opacity-50">Show all devices</button>
                 <button disabled={conn === "connecting"} onClick={startDemo} className="h-11 rounded-2xl border border-primary-foreground/20 bg-primary-foreground/15 text-sm font-semibold backdrop-blur-xl disabled:opacity-50">Demo mode</button>
              </>
            )}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-primary-foreground/20 pt-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">City model</p>
              <p className="text-xs text-primary-foreground/75">Scroll to orbit around the model</p>
            </div>
            <div className="flex items-center gap-1 rounded-full border border-primary-foreground/15 bg-primary-foreground/10 p-1 backdrop-blur-xl" aria-label="Model lighting view">
              <Button type="button" variant="ghost" aria-pressed={cityView === "night"} onClick={() => setCityView("night")}
                className={`h-9 rounded-full px-3 text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground ${cityView === "night" ? "bg-primary-foreground/25" : ""}`}>
                <Moon />Night
              </Button>
              <Button type="button" variant="ghost" aria-pressed={cityView === "day"} onClick={() => setCityView("day")}
                className={`h-9 rounded-full px-3 text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground ${cityView === "day" ? "bg-primary-foreground/25" : ""}`}>
                <Sun />Day
              </Button>
            </div>
            <Button type="button" variant="ghost" onClick={() => { void openModelFullscreen(); }}
              className="h-10 rounded-full border border-primary-foreground/20 bg-primary-foreground/12 px-4 text-primary-foreground backdrop-blur-xl hover:bg-primary-foreground/25 hover:text-primary-foreground">
              <Maximize />Full screen
            </Button>
          </div>
          {!bleOk && (
            <p className="mt-3 rounded-xl bg-destructive/25 px-3 py-2 text-sm">
              Web Bluetooth isn't available here (iPhone/Safari and Firefox don't support it). Use Chrome on Android or desktop — or try Demo mode.
            </p>
          )}
        </section>

        <TestingTools supported={bleOk} connection={conn} name={devName} demo={demo} diagnostics={diagnostics} errors={transportErrors} recentReplies={recentReplies} onRequestStatus={() => { void send("GET"); }} />

        <div className="grid grid-cols-2 gap-2">
          <Button variant="ghost" asChild className="glass-control h-12 rounded-xl"><Link to="/model"><Box />3D model</Link></Button>
          <Button variant="ghost" asChild className="glass-control h-12 rounded-xl"><Link to="/voice-agent"><Bot />Voice agent</Link></Button>
        </div>
        <Button variant="ghost" asChild className="glass-control h-12 w-full rounded-xl"><Link to="/esp32-code"><FileCode2 />ESP32 code</Link></Button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="ghost" asChild className="glass-control h-12 rounded-xl"><Link to="/launch-video"><Film />Launch video</Link></Button>
          <Button variant="ghost" asChild className="glass-control h-12 rounded-xl"><Link to="/circuit-diagram"><CircuitBoard />Circuit diagram</Link></Button>
          <Button variant="ghost" asChild className="glass-control h-12 rounded-xl"><Link to="/heading-board"><Signpost />Heading Board</Link></Button>
          <Button variant="ghost" asChild className="glass-control h-12 rounded-xl"><Link to="/game"><Gamepad2 />Smart City game</Link></Button>
        </div>
        <Button variant="ghost" asChild className="glass-control h-12 w-full rounded-xl"><Link to="/hydro-dam-template"><Scissors />Hydro dam template</Link></Button>

        <SmartCityMedia />

        <div className="grid gap-5 md:grid-cols-2 md:gap-6">
        <Card title="Lighting" icon={<Lamp size={18} />}>
          <div className="grid grid-cols-2 gap-3">
            <Tile label="Street lights" icon={<Lamp />} on={state.SL} disabled={disabled} onClick={() => toggle("SL")} />
            <Tile label="Building lights" icon={<Building2 />} on={state.BL} disabled={disabled} onClick={() => toggle("BL")} />
            <Tile label="Green status" icon={<Signal />} on={state.GR} disabled={disabled} onClick={() => toggle("GR")} tone="success" />
            <Tile label="Red beacons" icon={<Radio />} on={state.RD} disabled={disabled} onClick={() => toggle("RD")} tone="destructive" />
          </div>
        </Card>

        <Card title="Power" icon={<Zap size={18} />}>
          <div className="grid gap-3">
            <Tile label="Wind turbines" icon={<Fan className={state.WT ? "animate-spin" : ""} />} on={state.WT} disabled={disabled} onClick={() => toggle("WT")} />
          </div>
        </Card>

        <Card title="Sensors" icon={<Gauge size={18} />}>
          <div className="grid gap-3">
            <Ring label={state.LDR == null ? "LDR" : state.LDR < thr ? "Night" : "Day"} value={state.LDR} max={4095} unit="" />
          </div>
        </Card>

        <Card title="Scenes" icon={<Sparkles size={18} />}>
          <div className="grid grid-cols-4 gap-2">
            {([["day", Sun], ["night", Moon], ["eco", Leaf], ["show", Sparkles]] as const).map(([s, I]) => (
              <button key={s} disabled={disabled} onClick={() => scene(s)}
                className={`flex h-20 flex-col items-center justify-center gap-1 rounded-2xl border border-border/60 text-sm font-semibold capitalize backdrop-blur-xl transition active:scale-95 disabled:opacity-40 ${s === "show" && showRunning ? "bg-flame text-accent-foreground" : "glass-control text-secondary-foreground"}`}>
                <I size={22} />{s}
              </button>
            ))}
          </div>
          {showRunning && (
            <button onClick={stopShow} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-accent font-semibold text-accent">
              <Square size={16} /> Stop show
            </button>
          )}
        </Card>

        <Card title="AI Control Plan" icon={<Bot size={18} />}>
          <AIControlPlanPanel state={state} connected={!disabled} onApply={applyPlan} />
        </Card>

        <Card title="Party Mode" icon={<PartyPopper size={18} />}>
          <PartyModePanel connected={!disabled} demo={demo} musicPlaying={state.MU} onStart={sendSong} onStop={() => send("MP:0")} />
        </Card>

        <Card title="Auto Mode" icon={<Power size={18} />}>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Lights follow the light sensor — runs on the ESP32 even if the phone disconnects.</p>
            <Switch checked={state.AUTO} disabled={disabled} onCheckedChange={() => toggle("AUTO")} className="ml-3 scale-125" />
          </div>
          <div className="mt-4">
            <div className="mb-2 flex justify-between text-sm"><span>Light threshold</span><span className="font-semibold tabular-nums">{thr}</span></div>
            <Slider min={0} max={4095} step={5} value={[thr]} disabled={disabled}
              onValueChange={(v) => setThr(v[0] ?? 0)} onValueCommit={(v) => send(`THR:${v[0] ?? 0}`)} />
          </div>
        </Card>

        <button disabled={disabled} onClick={allOff}
          className="flex h-16 w-full items-center justify-center gap-2 rounded-2xl border border-destructive/40 bg-destructive/45 text-xl font-bold text-destructive-foreground shadow-card backdrop-blur-xl transition active:scale-[.98] disabled:opacity-40">
          <Power /> ALL OFF
        </button>
        </div>
      </main>

      <footer className="relative z-10 px-4 py-6 text-center text-sm text-muted-foreground">Project by {ORG_NAME}</footer>

      {logOpen && (
        <div className="fixed inset-0 z-30 flex items-end bg-foreground/40" onClick={() => setLogOpen(false)}>
          <div className="mx-auto max-h-[75vh] w-full max-w-3xl overflow-hidden rounded-t-3xl bg-card animate-in slide-in-from-bottom" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border p-4">
              <h2 className="font-display font-bold">Activity log</h2>
              <IconBtn label="Close" onClick={() => setLogOpen(false)}><X size={20} /></IconBtn>
            </div>
            <ul className="max-h-[60vh] space-y-1 overflow-y-auto p-3 font-mono text-xs">
              {logs.length === 0 && <li className="p-4 text-center text-muted-foreground">No activity yet</li>}
              {logs.map((l) => (
                <li key={l.id} className="flex gap-2 rounded-lg bg-muted px-2 py-1.5">
                  <span className="text-muted-foreground">{l.time}</span>
                  <span className={l.dir === "tx" ? "text-primary" : l.dir === "rx" ? "text-success" : "text-accent"}>{l.dir === "tx" ? "→" : l.dir === "rx" ? "←" : "•"}</span>
                  <span className="break-all">{l.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return <button aria-label={label} onClick={onClick} className="grid h-11 w-11 place-items-center rounded-full glass-control text-secondary-foreground active:scale-95">{children}</button>;
}

function Chip({ conn, name }: { conn: Conn; name: string }) {
  const dot = conn === "connected" ? "bg-success" : conn === "connecting" ? "bg-accent animate-pulse" : "bg-destructive";
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-full bg-primary-foreground/15 px-3 py-2 text-sm font-semibold">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
      {conn === "disconnected" ? <BluetoothOff size={16} /> : <Bluetooth size={16} />}
      <span className="truncate">{conn === "connected" ? `Connected · ${name}` : conn === "connecting" ? "Connecting…" : "Disconnected"}</span>
    </div>
  );
}

function Card({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl glass-panel p-4 animate-in fade-in slide-in-from-bottom-2 duration-500 md:p-5">
      <h2 className="mb-3 flex items-center gap-2 font-display font-semibold"><span className="text-primary">{icon}</span>{title}</h2>
      {children}
    </section>
  );
}

function Tile({ label, icon, on, disabled, onClick, tone = "primary" }: {
  label: string; icon: ReactNode; on: boolean; disabled: boolean; onClick: () => void; tone?: "primary" | "success" | "destructive";
}) {
  const onCls = tone === "success" ? "border border-success/50 bg-success/40 text-primary-foreground backdrop-blur-xl" : tone === "destructive" ? "border border-destructive/50 bg-destructive/40 text-destructive-foreground backdrop-blur-xl" : "border border-primary/50 bg-primary/40 text-primary-foreground backdrop-blur-xl";
  return (
    <button disabled={disabled} onClick={onClick} aria-pressed={on}
      className={`flex h-24 flex-col justify-between rounded-2xl border border-border/50 p-3 text-left backdrop-blur-xl transition-all duration-300 active:scale-95 disabled:opacity-40 ${on ? onCls + " shadow-card" : "glass-control text-foreground"}`}>
      {icon}
      <div><p className="text-sm font-semibold">{label}</p><p className="text-xs opacity-75">{on ? "ON" : "OFF"}</p></div>
    </button>
  );
}

function Ring({ label, value, max, unit, digits = 0 }: { label: string; value: number | null; max: number; unit: string; digits?: number }) {
  const pct = value == null ? 0 : Math.min(1, Math.max(0, value / max));
  const C = 2 * Math.PI * 42;
  return (
    <div className="flex flex-col items-center rounded-2xl glass-control p-3">
      <svg viewBox="0 0 100 100" className="h-28 w-28 -rotate-90">
        <circle cx="50" cy="50" r="42" fill="none" strokeWidth="10" className="stroke-border" />
        <circle cx="50" cy="50" r="42" fill="none" strokeWidth="10" strokeLinecap="round" className="stroke-accent transition-all duration-700"
          strokeDasharray={C} strokeDashoffset={C * (1 - pct)} />
      </svg>
      <p className="-mt-[74px] mb-10 font-display text-lg font-bold tabular-nums">{value == null ? "—" : value.toFixed(digits)}{unit && value != null ? unit : ""}</p>
      <p className="text-sm font-semibold">{label}</p>
    </div>
  );
}
