import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Copy, Download, FileCode2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const sketchUrl = "/esp32-code/HVM_SmartCity_ESP32.ino";

export const Route = createFileRoute("/esp32-code")({
  head: () => ({
    meta: [
      { title: "ESP32 Firmware Code — SmartCity Control" },
      { name: "description", content: "View, copy, or download the Hariyana Vidya Mandir Smart City ESP32 firmware sketch." },
      { property: "og:title", content: "ESP32 Firmware Code" },
      { property: "og:description", content: "The original Smart City ESP32 firmware sketch." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Esp32CodePage,
});

function Esp32CodePage() {
  const [source, setSource] = useState("");
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(sketchUrl, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("The ESP32 sketch could not be loaded.");
        return response.text();
      })
      .then(setSource)
      .catch(() => {
        if (!controller.signal.aborted) setLoadError(true);
      });
    return () => controller.abort();
  }, []);

  const copySource = async () => {
    try {
      await navigator.clipboard.writeText(source);
      toast.success("ESP32 code copied");
    } catch {
      toast.error("Could not copy the code. Check clipboard permission and try again.");
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col bg-background text-foreground">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Button variant="outline" size="icon" asChild>
          <Link to="/" aria-label="Back to Smart City Control"><ArrowLeft /></Link>
        </Button>
        <h1 className="min-w-0 flex-1 truncate font-display font-semibold">ESP32 Code</h1>
        <Button variant="outline" size="sm" onClick={copySource} disabled={!source}>
          <Copy /> Copy code
        </Button>
        <Button variant="outline" size="icon" asChild>
          <a href={sketchUrl} download="HVM_SmartCity_ESP32.ino" aria-label="Download ESP32 code">
            <Download />
          </a>
        </Button>
      </header>
      <section className="flex flex-1 flex-col gap-3 p-4">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileCode2 size={16} /> HVM_SmartCity_ESP32.ino
        </p>
        {loadError ? (
          <p role="alert" className="border border-destructive p-4 text-sm text-destructive">
            The ESP32 code could not be opened. You can still download the original file above.
          </p>
        ) : source ? (
          <pre className="min-h-0 flex-1 overflow-auto border border-border bg-muted p-4 font-mono text-xs leading-relaxed whitespace-pre"><code>{source}</code></pre>
        ) : (
          <p className="p-4 text-sm text-muted-foreground">Opening the ESP32 code…</p>
        )}
      </section>
    </main>
  );
}