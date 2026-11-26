import { createFileRoute } from "@tanstack/react-router";
import { PdfPages, type PdfPage } from "@/components/pdf-pages";

const PAGES: readonly PdfPage[] = [
  { n: 1, title: "Lights: white, yellow, green and red LEDs", detail: "D13, D12, D14, D15 and GND" },
  { n: 2, title: "Motors on the L298N motor driver", detail: "OUT1–OUT4" },
  { n: 3, title: "Motor driver inputs", detail: "IN1 D27, IN2 D26, IN3 D25, IN4 D33" },
  { n: 4, title: "Light sensor (LDR)", detail: "3V3 → LDR → D32, and D32 → resistor → GND" },
];

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
    <PdfPages
      title="Circuit Diagram"
      dir="/circuit-diagram"
      pdfName="circuit_diagram.pdf"
      filePrefix="circuit_diagram"
      pages={PAGES}
      width={2000}
      height={1125}
      intro="These 4 pages are the exact pin map of the ESP32 code on this website."
    />
  );
}
