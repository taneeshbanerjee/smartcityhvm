import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Download, Pause, Play, RotateCcw, Smartphone } from "lucide-react";
import { canLockLandscape, enterLandscape, leaveLandscape } from "@/lib/landscape";

const VIDEO_URL = "/launch-video/Smart_City_Launch.mp4";
const POSTER_URL = "/launch-video/poster.jpg";

export const Route = createFileRoute("/launch-video")({
  head: () => ({
    meta: [
      { title: "Smart City Launch Video — SmartCity Control" },
      { name: "description", content: "Watch the Hariyana Vidya Mandir Smart City launch video in full HD." },
      { property: "og:title", content: "Smart City Launch Video" },
      { property: "og:description", content: "The 60-second Smart City launch video." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LaunchVideoPage,
});

function LaunchVideoPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hideTimer = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [chrome, setChrome] = useState(true);
  const [portrait, setPortrait] = useState(false);
  const [canLock, setCanLock] = useState(false);

  // Track orientation; the page asks to rotate only when it can't do it itself.
  useEffect(() => {
    setCanLock(canLockLandscape());
    const query = window.matchMedia("(orientation: portrait) and (pointer: coarse)");
    const update = () => setPortrait(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  // Leaving the page releases the landscape lock and full screen started by the Launch video button.
  useEffect(() => () => { void leaveLandscape(); }, []);

  // The top bar and the centre button fade out while the video plays, and come back on any touch.
  const wake = useCallback(() => {
    setChrome(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setChrome(false), 2500);
  }, []);
  useEffect(() => () => { if (hideTimer.current) window.clearTimeout(hideTimer.current); }, []);

  const toggle = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused || video.ended) void video.play().catch(() => {});
    else video.pause();
  };

  const showChrome = chrome || !playing;

  return (
    <main
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black text-white"
      onPointerMove={() => { if (playing) wake(); }}
      onPointerDown={() => { if (playing) wake(); }}
    >
      <video
        ref={videoRef}
        className="h-full w-full object-contain"
        src={VIDEO_URL}
        poster={POSTER_URL}
        preload="auto"
        controls
        aria-label="Smart City launch video"
        onPlay={() => { setPlaying(true); setEnded(false); wake(); }}
        onPause={() => { setPlaying(false); setChrome(true); }}
        onEnded={() => { setPlaying(false); setEnded(true); setChrome(true); }}
      />

      <div
        className={`pointer-events-none absolute inset-x-0 top-0 flex items-center gap-2 bg-gradient-to-b from-black/70 to-transparent px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-8 transition-opacity duration-300 ${showChrome ? "opacity-100" : "opacity-0"}`}
      >
        <Link to="/" aria-label="Back to Smart City Control" className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full bg-white/15 backdrop-blur hover:bg-white/25">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="min-w-0 flex-1 truncate font-display text-base font-semibold">Smart City Launch Video</h1>
        {canLock && portrait && (
          <button type="button" onClick={() => { void enterLandscape(); }} className="pointer-events-auto flex h-10 items-center gap-1.5 rounded-full bg-white/15 px-3 text-sm font-semibold backdrop-blur hover:bg-white/25">
            <Smartphone size={16} className="rotate-90" /> Landscape
          </button>
        )}
        <a href={VIDEO_URL} download="Smart_City_Launch_Video.mp4" aria-label="Download launch video" className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full bg-white/15 backdrop-blur hover:bg-white/25">
          <Download size={18} />
        </a>
      </div>

      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause" : ended ? "Play again" : "Play"}
        className={`absolute grid h-20 w-20 place-items-center rounded-full bg-white/20 text-white shadow-lg backdrop-blur-md transition-opacity duration-300 hover:bg-white/30 active:scale-95 ${showChrome ? "opacity-100" : "pointer-events-none opacity-0"}`}
      >
        {playing ? <Pause size={36} fill="currentColor" /> : ended ? <RotateCcw size={34} /> : <Play size={36} fill="currentColor" className="ml-1" />}
      </button>

      {portrait && !canLock && !playing && (
        <p className="pointer-events-none absolute inset-x-0 bottom-[max(5rem,env(safe-area-inset-bottom))] flex items-center justify-center gap-2 text-sm text-white/80">
          <Smartphone size={16} className="rotate-90" /> Turn your phone sideways for full screen
        </p>
      )}
    </main>
  );
}
