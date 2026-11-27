import { createFileRoute } from "@tanstack/react-router";
import { PdfPages, type PdfPage } from "@/components/pdf-pages";

const PAGES: readonly PdfPage[] = [
  { n: 1, title: "Lights: white, yellow, green and red LEDs", detail: "D13, D12, D14, D15 and GND" },
  { n: 2, title: "Motor on the L298N motor driver", detail: "One wind turbine motor on OUT1/OUT2 (OUT3/OUT4 not used)" },
  { n: 3, title: "Motor driver inputs", detail: "IN1 D27 (speed, 10%), IN2 D26; IN3 D25 and IN4 D33 held off" },
  { n: 4, title: "Light sensor (LDR)", detail: "3V3 → LDR → D32, and D32 → resistor → GND" },
  { n: 5, title: "Party buzzer", detail: "D23 → resistor → buzzer +, buzzer − → GND" },
  { n: 6, title: "Voice assistant parts (planned)", detail: "INMP441 I2S microphone, MAX98357A I2S amplifier with 2 W 4 Ω speaker, 0.96 inch 128×64 OLED and a 5 mm LED. Reference diagram by SKR Electronics Lab; not wired on the model yet." },
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
      intro="Pages 1 to 5 are the exact pin map of the ESP32 code on this website. Page 6 shows the planned voice assistant parts."
    />
  );
}
