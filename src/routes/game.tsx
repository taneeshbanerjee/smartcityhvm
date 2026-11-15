import { useRef } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Expand, Maximize } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const gameUrl = "/smart-city-game/index.html";

export const Route = createFileRoute("/game")({
  head: () => ({
    meta: [
      { title: "Smart City Open World Game — SmartCity Control" },
      { name: "description", content: "Play the Hariyana Vidya Mandir Smart City open world game." },
      { property: "og:title", content: "Smart City Open World Game" },
      { property: "og:description", content: "Explore the Smart City in an open world game." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GamePage,
});

function GamePage() {
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  const openFullscreen = async () => {
    const frame = frameRef.current;
    if (!frame?.requestFullscreen) {
      toast.info("Full-screen play isn't available in this browser.");
      return;
    }
    try {
      await frame.requestFullscreen();
    } catch {
      toast.error("Couldn't open the game full screen. Check your browser permissions.");
    }
  };

  return (
    <main className="flex h-[calc(100dvh-4rem)] min-h-[32rem] flex-col bg-background text-foreground">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Button variant="outline" size="icon" asChild><Link to="/" aria-label="Back to Smart City Control"><ArrowLeft /></Link></Button>
        <h1 className="min-w-0 flex-1 truncate font-display font-semibold">Smart City Game</h1>
        <Button variant="outline" size="sm" onClick={() => { void openFullscreen(); }}><Maximize /> Full screen</Button>
        <Button variant="outline" size="sm" asChild><a href={gameUrl} target="_blank" rel="noreferrer"><Expand /> Open separately</a></Button>
      </header>
      <iframe
        ref={frameRef}
        title="Smart City Open World Game"
        src={gameUrl}
        sandbox="allow-scripts allow-pointer-lock"
        allowFullScreen
        className="min-h-0 flex-1 border-0"
      />
    </main>
  );
}
