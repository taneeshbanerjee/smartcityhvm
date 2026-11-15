import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Download, Expand } from "lucide-react";
import { Button } from "@/components/ui/button";

const diagramUrl = "/circuit-diagram/circuit_diagram.pdf";

export const Route = createFileRoute("/circuit-diagram")({
  head: () => ({
    meta: [
      { title: "Circuit Diagram — SmartCity Control" },
      { name: "description", content: "The Hariyana Vidya Mandir Smart City ESP32 circuit diagram." },
      { property: "og:title", content: "Smart City Circuit Diagram" },
      { property: "og:description", content: "Wiring for the Smart City ESP32 controller." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CircuitDiagramPage,
});

function CircuitDiagramPage() {
  return (
    <main className="flex h-[calc(100dvh-4rem)] min-h-[32rem] flex-col bg-background text-foreground">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Button variant="outline" size="icon" asChild>
          <Link to="/" aria-label="Back to Smart City Control"><ArrowLeft /></Link>
        </Button>
        <h1 className="min-w-0 flex-1 truncate font-display font-semibold">Circuit Diagram</h1>
        <Button variant="outline" size="sm" asChild>
          <a href={diagramUrl} target="_blank" rel="noreferrer"><Expand /> Open separately</a>
        </Button>
        <Button variant="outline" size="icon" asChild>
          <a href={diagramUrl} download="circuit_diagram.pdf" aria-label="Download circuit diagram"><Download /></a>
        </Button>
      </header>
      <object data={diagramUrl} type="application/pdf" aria-label="Smart City circuit diagram" className="min-h-0 w-full flex-1">
        <div className="flex flex-col items-start gap-3 p-4 text-sm text-muted-foreground">
          <p>This browser can't show the PDF here. Open it separately or download it.</p>
          <Button variant="outline" asChild><a href={diagramUrl} target="_blank" rel="noreferrer"><Expand /> Open circuit diagram</a></Button>
        </div>
      </object>
    </main>
  );
}
