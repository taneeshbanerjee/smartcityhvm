import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink, Mic2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const voiceAgentUrl = "https://elevenlabs.io/app/talk-to?agent_id=agent_8501m6p7jphke1xrmpp9zc6zm02c&branch_id=agtbrch_3101m6p7jrzwfkabjvn07824dv8x";

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
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col bg-background text-foreground">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Button variant="outline" size="icon" asChild><Link to="/" aria-label="Back to Smart City Control"><ArrowLeft /></Link></Button>
        <h1 className="min-w-0 flex-1 font-display font-semibold">Smart City Voice Agent</h1>
        <Button variant="outline" size="sm" asChild><a href={voiceAgentUrl} target="_blank" rel="noreferrer"><ExternalLink /> Open separately</a></Button>
      </header>
      <section className="space-y-2 border-b border-border px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-semibold"><Mic2 size={16} />Karaoke audio</p>
        <p className="text-sm text-muted-foreground">Pair the karaoke speaker in your device’s Bluetooth settings and select it as the device audio output. The voice agent’s audio is controlled by your browser and device, not by the description player’s output selector.</p>
      </section>
      <iframe
        title="ElevenLabs Smart City Voice Agent"
        src={voiceAgentUrl}
        allow="microphone; autoplay"
        referrerPolicy="strict-origin-when-cross-origin"
        className="min-h-[34rem] w-full flex-1 border-0"
      />
    </main>
  );
}