import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Download } from "lucide-react";
import launchVideo from "@/assets/smart-city-launch.mp4.asset.json";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/launch-video")({
  head: () => ({
    meta: [
      { title: "Smart City Launch Video — SmartCity Control" },
      { name: "description", content: "Watch the Hariyana Vidya Mandir Smart City launch video." },
      { property: "og:title", content: "Smart City Launch Video" },
      { property: "og:description", content: "The 30-second Smart City launch video." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LaunchVideoPage,
});

function LaunchVideoPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col bg-background text-foreground">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Button variant="outline" size="icon" asChild>
          <Link to="/" aria-label="Back to Smart City Control"><ArrowLeft /></Link>
        </Button>
        <h1 className="min-w-0 flex-1 truncate font-display font-semibold">Smart City Launch Video</h1>
        <Button variant="outline" size="icon" asChild>
          <a href={launchVideo.url} download="Smart_City_Launch_Video.mp4" aria-label="Download launch video"><Download /></a>
        </Button>
      </header>
      <section className="flex flex-1 items-center justify-center p-4">
        <video
          className="max-h-[80dvh] w-full rounded-xl bg-black"
          src={launchVideo.url}
          controls
          playsInline
          preload="metadata"
          aria-label="Smart City launch video"
        />
      </section>
    </main>
  );
}
