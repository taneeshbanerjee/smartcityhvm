import { useRef } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Download } from "lucide-react";
import launchVideo30s from "@/assets/smart-city-launch.mp4.asset.json";
import { Button } from "@/components/ui/button";

const VIDEOS = [
  {
    id: "1min",
    title: "Launch video · 1 minute",
    src: "/launch-video/Smart_City_Launch.mp4",
    poster: "/launch-video/poster.jpg",
    fileName: "Smart_City_Launch_Video_1_minute.mp4",
  },
  {
    id: "30s",
    title: "Launch video · 30 seconds",
    src: launchVideo30s.url,
    poster: "/launch-video/poster-30s.jpg",
    fileName: "Smart_City_Launch_Video_30_seconds.mp4",
  },
] as const;

export const Route = createFileRoute("/launch-video")({
  head: () => ({
    meta: [
      { title: "Smart City Launch Videos — SmartCity Control" },
      { name: "description", content: "Watch the Hariyana Vidya Mandir Smart City launch videos in full HD: the 1-minute and 30-second edits." },
      { property: "og:title", content: "Smart City Launch Videos" },
      { property: "og:description", content: "The 1-minute and 30-second Smart City launch videos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LaunchVideoPage,
});

function LaunchVideoPage() {
  const players = useRef<Record<string, HTMLVideoElement | null>>({});
  // Only one video plays at a time.
  const onPlay = (id: string) => {
    for (const [other, video] of Object.entries(players.current)) if (other !== id) video?.pause();
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col bg-background text-foreground">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Button variant="outline" size="icon" asChild>
          <Link to="/" aria-label="Back to Smart City Control"><ArrowLeft /></Link>
        </Button>
        <h1 className="min-w-0 flex-1 truncate font-display font-semibold">Smart City Launch Videos</h1>
      </header>
      <section className="space-y-8 p-4">
        {VIDEOS.map((video) => (
          <VideoCard key={video.id} {...video} register={(el) => { players.current[video.id] = el; }} onPlay={() => onPlay(video.id)} />
        ))}
      </section>
    </main>
  );
}

function VideoCard({ title, src, poster, fileName, register, onPlay }: {
  title: string;
  src: string;
  poster: string;
  fileName: string;
  register: (el: HTMLVideoElement | null) => void;
  onPlay: () => void;
}) {
  return (
    <figure className="space-y-2">
      <figcaption className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        <Button variant="outline" size="sm" asChild>
          <a href={src} download={fileName} aria-label={`Download ${title}`}><Download /> Download</a>
        </Button>
      </figcaption>
      <div className="overflow-hidden rounded-xl bg-black">
        <video
          ref={register}
          className="aspect-video w-full"
          src={src}
          poster={poster}
          preload="metadata"
          controls
          aria-label={title}
          onPlay={onPlay}
        />
      </div>
    </figure>
  );
}
