import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Download, Expand, ImageDown } from "lucide-react";
import { Button } from "@/components/ui/button";

export type PdfPage = { n: number; title: string; detail?: string };

/**
 * A PDF shown as one image per page, so it previews on every browser (mobile browsers often
 * can't show a PDF inside a page), with a full-PDF download and a full-quality image per page.
 * Files: `${dir}/${pdfName}`, `${dir}/page-N.webp` (preview) and `${dir}/page-N.png` (download).
 */
export function PdfPages({ title, dir, pdfName, filePrefix, pages, width, height, intro }: {
  title: string;
  dir: string;
  pdfName: string;
  filePrefix: string;
  pages: readonly PdfPage[];
  width: number;
  height: number;
  intro?: ReactNode;
}) {
  const pdfUrl = `${dir}/${pdfName}`;
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col bg-background text-foreground">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur">
        <Button variant="outline" size="icon" asChild>
          <Link to="/" aria-label="Back to Smart City Control"><ArrowLeft /></Link>
        </Button>
        <h1 className="min-w-0 flex-1 truncate font-display font-semibold">{title}</h1>
        <Button variant="outline" size="icon" asChild>
          <a href={pdfUrl} target="_blank" rel="noreferrer" aria-label="Open the PDF separately"><Expand /></a>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <a href={pdfUrl} download={pdfName} aria-label={`Download all ${pages.length} pages as one PDF`}><Download /> Download PDF</a>
        </Button>
      </header>
      <section className="space-y-6 p-4">
        <Button asChild className="h-12 w-full rounded-xl text-base">
          <a href={pdfUrl} download={pdfName}><Download /> Download all {pages.length} pages (PDF)</a>
        </Button>
        <p className="text-sm text-muted-foreground">
          {pages.length} pages. The PDF has every page together in one file; each page can also be downloaded as an image below.{intro ? <> {intro}</> : null}
        </p>
        {pages.map((page) => (
          <figure key={page.n} className="space-y-2">
            <img
              src={`${dir}/page-${page.n}.webp`}
              alt={`${title} page ${page.n}: ${page.title}${page.detail ? ` (${page.detail})` : ""}`}
              width={width}
              height={height}
              loading={page.n === 1 ? "eager" : "lazy"}
              className="h-auto w-full rounded-xl border border-border bg-white"
            />
            <figcaption className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm">
                <span className="font-semibold">Page {page.n}: {page.title}</span>
                {page.detail && <span className="text-muted-foreground"> · {page.detail}</span>}
              </span>
              <Button variant="outline" size="sm" asChild>
                <a href={`${dir}/page-${page.n}.png`} download={`${filePrefix}_page_${page.n}.png`}>
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
