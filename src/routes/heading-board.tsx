import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Download, Maximize } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const VIEWER_CHANNEL = "heading-board-viewer";
const VIEWER_VERSION = 1;
const BOARD_FILE = "/heading-boards/Heading Board.3mf";
const BOARD_FILE_NAME = "Heading Board.3mf";

type ViewerReply = { channel: typeof VIEWER_CHANNEL; version: typeof VIEWER_VERSION; type: "ready" | "loaded" | "error"; message?: string };

export const Route = createFileRoute("/heading-board")({
  head: () => ({
    meta: [
      { title: "Heading Board — SmartCity Control" },
      { name: "description", content: "View the Smart City Heading Board in 3D or download the original file." },
      { property: "og:title", content: "Heading Board" },
      { property: "og:description", content: "The Smart City Heading Board 3D file." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HeadingBoardPage,
});

function HeadingBoardPage() {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");

  useEffect(() => {
    const controller = new AbortController();
    let requested = false;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      const data = event.data as Partial<ViewerReply> | null;
      if (!data || data.channel !== VIEWER_CHANNEL || data.version !== VIEWER_VERSION) return;
      if (data.type === "loaded") setStatus("loaded");
      if (data.type === "error") setStatus("error");
      if (data.type !== "ready" || requested) return;
      requested = true;
      fetch(encodeURI(BOARD_FILE), { signal: controller.signal })
        .then((response) => {
          if (!response.ok) throw new Error("The heading board file could not be loaded.");
          return response.arrayBuffer();
        })
        .then((buffer) => {
          // The viewer is sandboxed without allow-same-origin, so its origin is opaque.
          frameRef.current?.contentWindow?.postMessage(
            { channel: VIEWER_CHANNEL, version: VIEWER_VERSION, type: "load", format: "3mf", data: buffer },
            "*",
            [buffer],
          );
        })
        .catch(() => {
          if (!controller.signal.aborted) setStatus("error");
        });
    };
    window.addEventListener("message", onMessage);
    // The viewer may have announced itself before this page hydrated, so ask again.
    const hello = { channel: VIEWER_CHANNEL, version: VIEWER_VERSION, type: "hello" };
    frameRef.current?.contentWindow?.postMessage(hello, "*");
    return () => {
      controller.abort();
      window.removeEventListener("message", onMessage);
    };
  }, []);

  const openFullscreen = async () => {
    const frame = frameRef.current;
    if (!frame?.requestFullscreen) {
      toast.info("Full-screen viewing isn't available in this browser.");
      return;
    }
    try {
      await frame.requestFullscreen();
    } catch {
      toast.error("Couldn't open the heading board full screen. Check your browser permissions.");
    }
  };

  return (
    <main className="flex h-[calc(100dvh-4rem)] min-h-[32rem] flex-col bg-background text-foreground">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Button variant="outline" size="icon" asChild><Link to="/" aria-label="Back to Smart City Control"><ArrowLeft /></Link></Button>
        <h1 className="min-w-0 flex-1 truncate font-display font-semibold">Heading Board</h1>
        <Button variant="outline" size="sm" onClick={() => { void openFullscreen(); }}><Maximize /> Full screen</Button>
        <Button variant="outline" size="sm" asChild>
          <a href={encodeURI(BOARD_FILE)} download={BOARD_FILE_NAME} aria-label={`Download ${BOARD_FILE_NAME}`}><Download /> Download</a>
        </Button>
      </header>
      {status === "error" && (
        <p role="alert" className="border-b border-destructive px-4 py-2 text-sm text-destructive">
          The 3D view could not be opened. You can still download {BOARD_FILE_NAME} above.
        </p>
      )}
      <iframe
        ref={frameRef}
        title="Heading Board 3D view"
        src="/heading-boards/viewer.html"
        sandbox="allow-scripts"
        allowFullScreen
        onLoad={(event) => event.currentTarget.contentWindow?.postMessage({ channel: VIEWER_CHANNEL, version: VIEWER_VERSION, type: "hello" }, "*")}
        className="min-h-0 flex-1 border-0"
      />
    </main>
  );
}
