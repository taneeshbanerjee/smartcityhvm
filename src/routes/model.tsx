import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Expand } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  return (
    <main className="flex h-[calc(100dvh-4rem)] min-h-[32rem] flex-col bg-background text-foreground">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Button variant="outline" size="icon" asChild><Link to="/" aria-label="Back to Smart City Control"><ArrowLeft /></Link></Button>
        <h1 className="min-w-0 flex-1 truncate font-display font-semibold">Smart City 3D Model</h1>
        <Button variant="outline" size="sm" asChild><a href="/smart-city-model/index.html" target="_blank" rel="noreferrer"><Expand /> Open separately</a></Button>
      </header>
      <iframe
        title="Interactive Smart City 3D Model"
        src="/smart-city-model/index.html"
        sandbox="allow-scripts allow-pointer-lock"
        className="min-h-0 flex-1 border-0"
      />
    </main>
  );
}