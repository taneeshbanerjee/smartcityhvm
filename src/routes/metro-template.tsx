import { createFileRoute } from "@tanstack/react-router";
import { PdfPages, type PdfPage } from "@/components/pdf-pages";

const PAGES: readonly PdfPage[] = [
  { n: 1, title: "Overview", detail: "what you will build, key sizes, materials" },
  { n: 2, title: "Step-by-step instructions" },
  { n: 3, title: "Track segments 1 and 2", detail: "real size" },
  { n: 4, title: "Track segment 3, joint sleeves, end stops", detail: "real size" },
  { n: 5, title: "Pillars, feet and caps", detail: "real size · make 8: 6 needed + 2 spare" },
  { n: 6, title: "Train: 3 cars", detail: "real size · 2 cm wide" },
  { n: 7, title: "Station 1 platform", detail: "real size" },
  { n: 8, title: "Station 2 platform", detail: "real size" },
  { n: 9, title: "Canopy roofs, posts, stairs and METRO signs", detail: "real size" },
];

export const Route = createFileRoute("/metro-template")({
  head: () => ({
    meta: [
      { title: "Metro Template — SmartCity Control" },
      { name: "description", content: "Printable real-size build template for the Smart City's elevated metro line, train and stations." },
      { property: "og:title", content: "Smart City Metro Build Template" },
      { property: "og:description", content: "Track, pillars, a 3-car train and two stations to print, cut, fold and glue." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MetroTemplatePage,
});

function MetroTemplatePage() {
  return (
    <PdfPages
      title="Metro Template"
      dir="/metro-template"
      pdfName="Smart_City_Metro_Template.pdf"
      filePrefix="metro_template"
      pages={PAGES}
      width={2339}
      height={1654}
      intro='To print the cut-out pieces at real size, print the PDF at 100% ("Actual size") on A4 landscape and check the 5 cm bar on page 1.'
    />
  );
}
