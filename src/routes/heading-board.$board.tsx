import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Download, Maximize } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const VIEWER_CHANNEL = "heading-board-viewer";
const VIEWER_VERSION = 1;

const HEADING_BOARDS = {
  "1": { title: "Heading Board 1", file: "/heading-boards/Heading Board 1.3mf", fileName: "Heading Board 1.3mf", format: "3mf" },
  "2": { title: "Heading Board 2", file: "/heading-boards/Heading Board 2.glb", fileName: "Heading Board 2.glb", format: "glb" },
} as const;

type BoardId = keyof typeof HEADING_BOARDS;
type ViewerReply = { channel: typeof VIEWER_CHANNEL; version: typeof VIEWER_VERSION; type: "ready" | "loaded" | "error"; message?: string };

const isBoardId = (value: string): value is BoardId => value === "1" || value === "2";

export const Route = createFileRoute("/heading-board/$board")({
  head: ({ params }) => {
    const title = isBoardId(params.board) ? HEADING_BOARDS[params.board].title : "Heading Board";
    return {
      meta: [
        { title: `${title} — SmartCity Control` },
        { name: "description", content: `View the Smart City ${title} in 3D or download the original file.` },
        { property: "og:title", content: title },
        { property: "og:description", content: `The Smart City ${title} 3D file.` },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: HeadingBoardPage,
});

function HeadingBoardPage() {
  const { board } = Route.useParams();
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const info = isBoardId(board) ? HEADING_BOARDS[board] : null;

  useEffect(() => {
    if (!info) return;
    setStatus("loading");
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
      fetch(encodeURI(info.file), { signal: controller.signal })
        .then((response) => {
          if (!response.ok) throw new Error("The heading board file could not be loaded.");
          return response.arrayBuffer();
        })
        .then((buffer) => {
          // The viewer is sandboxed without allow-same-origin, so its origin is opaque.
          frameRef.current?.contentWindow?.postMessage(
            { channel: VIEWER_CHANNEL, version: VIEWER_VERSION, type: "load", format: info.format, data: buffer },
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
  }, [info]);

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

  if (!info) {
    return (
      <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-4 bg-background p-4 text-foreground">
        <Button variant="outline" size="icon" asChild><Link to="/" aria-label="Back to Smart City Control"><ArrowLeft /></Link></Button>
        <p role="alert">That heading board doesn't exist. Choose Heading Board 1 or Heading Board 2.</p>
      </main>
    );
  }

  return (
    <main className="flex h-[calc(100dvh-4rem)] min-h-[32rem] flex-col bg-background text-foreground">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Button variant="outline" size="icon" asChild><Link to="/" aria-label="Back to Smart City Control"><ArrowLeft /></Link></Button>
        <h1 className="min-w-0 flex-1 truncate font-display font-semibold">{info.title}</h1>
        <Button variant="outline" size="sm" onClick={() => { void openFullscreen(); }}><Maximize /> Full screen</Button>
        <Button variant="outline" size="sm" asChild>
          <a href={encodeURI(info.file)} download={info.fileName} aria-label={`Download ${info.fileName}`}><Download /> Download</a>
        </Button>
      </header>
      {status === "error" && (
        <p role="alert" className="border-b border-destructive px-4 py-2 text-sm text-destructive">
          The 3D view could not be opened. You can still download {info.fileName} above.
        </p>
      )}
      <iframe
        key={board}
        ref={frameRef}
        title={`${info.title} 3D view`}
        src="/heading-boards/viewer.html"
        sandbox="allow-scripts"
        allowFullScreen
        onLoad={(event) => event.currentTarget.contentWindow?.postMessage({ channel: VIEWER_CHANNEL, version: VIEWER_VERSION, type: "hello" }, "*")}
        className="min-h-0 flex-1 border-0"
      />
    </main>
  );
}
