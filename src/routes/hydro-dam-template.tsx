import { useRef } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Download, Maximize, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const templateUrl = "/hydro-dam-template/index.html";

export const Route = createFileRoute("/hydro-dam-template")({
  head: () => ({
    meta: [
      { title: "Hydro Dam Template — SmartCity Control" },
      { name: "description", content: "Printable, actual-size build template for the Smart City model's hydroelectric dam, sized to your base board." },
      { property: "og:title", content: "Hydroelectric Dam Build Template" },
      { property: "og:description", content: "Cut lines, fold lines and sizes for the dam, gates, spillways, control station and turbine wheels." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HydroDamTemplatePage,
});

function HydroDamTemplatePage() {
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  const openFullscreen = async () => {
    const frame = frameRef.current;
    if (!frame?.requestFullscreen) {
      toast.info("Full-screen viewing isn't available in this browser.");
      return;
    }
    try {
      await frame.requestFullscreen();
    } catch {
      toast.error("Couldn't open the template full screen. Check your browser permissions.");
    }
  };

  return (
    <main className="flex h-[calc(100dvh-4rem)] min-h-[32rem] flex-col bg-background text-foreground">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Button variant="outline" size="icon" asChild><Link to="/" aria-label="Back to Smart City Control"><ArrowLeft /></Link></Button>
        <h1 className="min-w-0 flex-1 truncate font-display font-semibold">Hydro Dam Template</h1>
        <Button variant="outline" size="icon" onClick={() => { void openFullscreen(); }} aria-label="Full screen"><Maximize /></Button>
        <Button variant="outline" size="sm" asChild>
          <a href={templateUrl} target="_blank" rel="noreferrer"><Printer /> Open to print</a>
        </Button>
        <Button variant="outline" size="icon" asChild>
          <a href={templateUrl} download="Hydro_Dam_Template.html" aria-label="Download the hydro dam template"><Download /></a>
        </Button>
      </header>
      <iframe
        ref={frameRef}
        title="Hydroelectric dam build template"
        src={templateUrl}
        sandbox="allow-scripts"
        allowFullScreen
        className="min-h-0 flex-1 border-0 bg-white"
      />
    </main>
  );
}
