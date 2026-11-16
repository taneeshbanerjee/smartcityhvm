import { useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Download, Expand, Loader2, Maximize } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { downloadStandaloneHtml } from "@/lib/standalone-download";

export const Route = createFileRoute("/model")({
  head: () => ({
    meta: [
      { title: "Smart City 3D Model — SmartCity Control" },
      { name: "description", content: "Explore the interactive Hariyana Vidya Mandir smart-city model." },
      { property: "og:title", content: "Smart City 3D Model" },
      { property: "og:description", content: "Explore the interactive Smart City blueprint model." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ModelPage,
});

function ModelPage() {
  const modelFrameRef = useRef<HTMLIFrameElement | null>(null);
  const [downloading, setDownloading] = useState(false);

  const download = async () => {
    setDownloading(true);
    try {
      await downloadStandaloneHtml("/smart-city-model/index.html", "/smart-city-model/three.min.js", "Smart_City_3D_Model.html");
    } catch {
      toast.error("Couldn't download the 3D model. Check your connection and try again.");
    } finally {
      setDownloading(false);
    }
  };

  const openFullscreen = async () => {
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

  return (
    <main className="flex h-[calc(100dvh-4rem)] min-h-[32rem] flex-col bg-background text-foreground">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Button variant="outline" size="icon" asChild><Link to="/" aria-label="Back to Smart City Control"><ArrowLeft /></Link></Button>
        <h1 className="min-w-0 flex-1 truncate font-display font-semibold">Smart City 3D Model</h1>
        <Button variant="outline" size="sm" onClick={() => { void openFullscreen(); }}><Maximize /> Full screen</Button>
        <Button variant="outline" size="icon" asChild><a href="/smart-city-model/index.html" target="_blank" rel="noreferrer" aria-label="Open the 3D model separately"><Expand /></a></Button>
        <Button variant="outline" size="sm" onClick={() => { void download(); }} disabled={downloading}>
          {downloading ? <Loader2 className="animate-spin" /> : <Download />} Download
        </Button>
      </header>
      <iframe
        ref={modelFrameRef}
        title="Interactive Smart City 3D Model"
        src="/smart-city-model/index.html"
        sandbox="allow-scripts allow-pointer-lock"
        allowFullScreen
        className="min-h-0 flex-1 border-0"
      />
    </main>
  );
}