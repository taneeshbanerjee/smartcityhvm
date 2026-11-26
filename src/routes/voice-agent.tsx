import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Cpu, ExternalLink, Mic2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const voiceAgentUrl = "https://elevenlabs.io/app/talk-to?agent_id=agent_6501m6s6yy59fht8mfqcfk30wycb";
const voiceAgentId = "agent_6501m6s6yy59fht8mfqcfk30wycb";

export const Route = createFileRoute("/voice-agent")({
  head: () => ({
    meta: [
      { title: "Smart City Voice Agent — SmartCity Control" },
      { name: "description", content: "Talk with the Smart City Voice Agent." },
      { property: "og:title", content: "Smart City Voice Agent" },
      { property: "og:description", content: "Talk with the Smart City Voice Agent." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VoiceAgentPage,
});

function VoiceAgentPage() {
  const widgetHost = useRef<HTMLDivElement | null>(null);
  const [widgetReady, setWidgetReady] = useState(false);

  useEffect(() => {
    let active = true;
    const host = widgetHost.current;
    if (!host) return;
    const mountWidget = () => {
      if (!active || !host) return;
      const widget = document.createElement("elevenlabs-convai");
      widget.setAttribute("agent-id", voiceAgentId);
      host.replaceChildren(widget);
      setWidgetReady(true);
    };

    if (customElements.get("elevenlabs-convai")) {
      mountWidget();
    } else {
      const existing = document.getElementById("elevenlabs-convai-widget") as HTMLScriptElement | null;
      const script = existing ?? document.createElement("script");
      if (!existing) {
        script.id = "elevenlabs-convai-widget";
        script.src = "https://unpkg.com/@elevenlabs/convai-widget-embed";
        script.async = true;
        script.type = "text/javascript";
        document.head.appendChild(script);
      }
      script.addEventListener("load", mountWidget, { once: true });
      script.addEventListener("error", () => { if (active) setWidgetReady(false); }, { once: true });
      if (customElements.get("elevenlabs-convai")) mountWidget();
    }

    return () => { active = false; host.replaceChildren(); };
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col bg-background text-foreground">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Button variant="outline" size="icon" asChild><Link to="/" aria-label="Back to Smart City Control"><ArrowLeft /></Link></Button>
        <h1 className="min-w-0 flex-1 font-display font-semibold">Smart City Voice Agent</h1>
        <Button variant="outline" size="sm" asChild><a href={voiceAgentUrl} target="_blank" rel="noreferrer"><ExternalLink /> Open separately</a></Button>
      </header>
      <section className="space-y-2 border-b border-border px-4 py-3">
        <Button asChild className="h-11 w-full rounded-xl sm:w-auto">
          <a href="https://skrelectronicslab.com/xiaozhi-ai-pro-firmware-flasher-for-esp32/" target="_blank" rel="noopener noreferrer"><Cpu /> Flash firmware</a>
        </Button>
        <p className="text-sm text-muted-foreground">Opens the XiaoZhi AI firmware flasher for ESP32 by SKR Electronics Lab. Flashing it replaces the Smart City code on that ESP32.</p>
      </section>
      <section className="space-y-2 border-b border-border px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-semibold"><Mic2 size={16} />Karaoke audio</p>
        <p className="text-sm text-muted-foreground">Pair the karaoke speaker in your device’s Bluetooth settings and select it as the device audio output. The voice agent’s audio is controlled by your browser and device, not by the description player’s output selector.</p>
      </section>
      <section className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-8">
        <div ref={widgetHost} className="min-h-52 w-full max-w-xl" aria-label="Smart City Voice Agent" />
        {!widgetReady && <p className="text-center text-sm text-muted-foreground">The voice agent widget could not be loaded. It may require public access in ElevenLabs.</p>}
        <Button variant="outline" asChild><a href={voiceAgentUrl} target="_blank" rel="noreferrer"><ExternalLink /> Open the provided ElevenLabs agent</a></Button>
      </section>
    </main>
  );
}