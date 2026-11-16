import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2, Moon, Sun } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { PlanAction } from "@/lib/ai-control-plan";
import { planPreviewDevices, planPreviewTheme, type PreviewDevices } from "@/lib/plan-preview";
import type { CityState } from "@/lib/smartcity";

const CHANNEL = "smartcity-model-control";
const VERSION = 1;

/**
 * Shows the real 3D city model with the plan applied. The model page stays sandboxed and is
 * driven only by the versioned "smartcity-model-control" messages (state, devices, snapshot).
 */
export function PlanCityPreview({ state, actions, title }: { state: CityState; actions: PlanAction[]; title: string }) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const devices: PreviewDevices = planPreviewDevices(state, actions);
  const theme = planPreviewTheme(devices);
  const [view, setView] = useState<"night" | "day">(theme);
  const showsGreen = actions.some((action) => action.device === "GR");

  useEffect(() => { setView(theme); }, [theme]);

  const post = useCallback((message: Record<string, unknown>) => {
    // Sandboxed without allow-same-origin, so the frame's origin is opaque.
    frameRef.current?.contentWindow?.postMessage({ channel: CHANNEL, version: VERSION, ...message }, "*");
  }, []);

  const devicesKey = JSON.stringify(devices);
  useEffect(() => {
    if (!loaded) return;
    post({ type: "devices", devices: JSON.parse(devicesKey) as PreviewDevices });
    post({ type: "state", theme: view });
  }, [loaded, devicesKey, view, post]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      const data = event.data as { channel?: unknown; version?: unknown; type?: unknown; image?: unknown } | null;
      if (!data || data.channel !== CHANNEL || data.version !== VERSION || data.type !== "snapshot") return;
      setSaving(false);
      if (typeof data.image !== "string" || !data.image.startsWith("data:image/png;base64,")) {
        toast.error("Couldn't save the preview image. Please try again.");
        return;
      }
      const link = document.createElement("a");
      link.href = data.image;
      link.download = `${title.replace(/[^\w -]+/g, "").trim().replace(/\s+/g, "_") || "Smart_City_plan"}.png`;
      link.click();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [title]);

  const saveImage = () => {
    setSaving(true);
    post({ type: "snapshot" });
    window.setTimeout(() => setSaving(false), 5000);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">How our city will look</p>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon" aria-label={view === "night" ? "Show in daylight" : "Show at night"}
            onClick={() => setView((current) => (current === "night" ? "day" : "night"))} className="glass-control h-8 w-8 rounded-full">
            {view === "night" ? <Sun /> : <Moon />}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={saveImage} disabled={!loaded || saving} className="glass-control h-8 rounded-full">
            {saving ? <Loader2 className="animate-spin" /> : <Download />} Save image
          </Button>
        </div>
      </div>
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-border/60 bg-muted">
        <iframe
          ref={frameRef}
          title="3D preview of our city with this plan applied"
          src="/smart-city-model/index.html?preview=1"
          sandbox="allow-scripts"
          onLoad={() => setLoaded(true)}
          className="absolute inset-0 h-full w-full border-0"
        />
        {!loaded && <p className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">Loading our city…</p>}
      </div>
      <p className="text-xs text-muted-foreground">
        Rendered from our own 3D city model, not drawn by AI. Drag to rotate, pinch or scroll to zoom.
        {showsGreen ? " Green status lights aren't part of the 3D model, so they don't appear here." : ""}
      </p>
    </div>
  );
}
