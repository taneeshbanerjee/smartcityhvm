import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Download, Expand, ImageDown } from "lucide-react";
import { Button } from "@/components/ui/button";

const diagramUrl = "/circuit-diagram/circuit_diagram.pdf";

// Each PDF page is also served as an image so the diagram previews on every browser
// (mobile browsers often can't show a PDF inside a page).
const PAGES = [
  { n: 1, title: "Lights: white, yellow, green and red LEDs", pins: "D13, D12, D14, D15 and GND" },
  { n: 2, title: "Motors on the L298N motor driver", pins: "OUT1–OUT4" },
  { n: 3, title: "Motor driver inputs", pins: "IN1 D27, IN2 D26, IN3 D25, IN4 D33" },
  { n: 4, title: "Light sensor (LDR)", pins: "3V3, D32 and GND" },
  { n: 5, title: "Party buzzer", pins: "D23 through the resistor, and GND" },
  { n: 6, title: "Microphone, speaker amplifier, OLED display and LED", pins: "INMP441, MAX98357A with 2 W speaker, 0.96\" OLED, 5 mm LED" },
] as const;

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
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col bg-background text-foreground">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur">
        <Button variant="outline" size="icon" asChild>
          <Link to="/" aria-label="Back to Smart City Control"><ArrowLeft /></Link>
        </Button>
        <h1 className="min-w-0 flex-1 truncate font-display font-semibold">Circuit Diagram</h1>
        <Button variant="outline" size="icon" asChild>
          <a href={diagramUrl} target="_blank" rel="noreferrer" aria-label="Open the PDF separately"><Expand /></a>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <a href={diagramUrl} download="circuit_diagram.pdf" aria-label={`Download all ${PAGES.length} pages as one PDF`}><Download /> All pages (PDF)</a>
        </Button>
      </header>
      <section className="space-y-6 p-4">
        <p className="text-sm text-muted-foreground">
          {PAGES.length} pages. "All pages (PDF)" downloads every page together in one file. Pages 1–5 match the ESP32 code on this website.
        </p>
        {PAGES.map((page) => (
          <figure key={page.n} className="space-y-2">
            <img
              src={`/circuit-diagram/page-${page.n}.webp`}
              alt={`Circuit diagram page ${page.n}: ${page.title} (${page.pins})`}
              width={2000}
              height={1125}
              loading={page.n === 1 ? "eager" : "lazy"}
              className="h-auto w-full rounded-xl border border-border bg-white"
            />
            <figcaption className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm">
                <span className="font-semibold">Page {page.n}: {page.title}</span>
                <span className="text-muted-foreground"> · {page.pins}</span>
              </span>
              <Button variant="outline" size="sm" asChild>
                <a href={`/circuit-diagram/page-${page.n}.png`} download={`circuit_diagram_page_${page.n}.png`}>
                  <ImageDown /> Download page {page.n}
                </a>
              </Button>
            </figcaption>
          </figure>
        ))}
      </section>
    </main>
  );
}
