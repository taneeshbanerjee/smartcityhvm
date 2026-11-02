import { useEffect, useState } from "react";
import { Download, ExternalLink, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallNotice() {
  const [visible, setVisible] = useState(false);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [apple, setApple] = useState(false);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)");
    const isInstalled = () => standalone.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    let dismissed = false;
    try { dismissed = sessionStorage.getItem("smartcity-install-dismissed") === "1"; } catch { /* Storage can be unavailable. */ }
    setVisible(!isInstalled() && !dismissed);
    setApple(/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
    setPreview(window.location.hostname !== "smartcity3d.lovable.app");
    const onPrompt = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const onInstalled = () => { setVisible(false); setOpen(false); setPrompt(null); };
    const onDisplayChange = () => { if (isInstalled()) onInstalled(); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    standalone.addEventListener("change", onDisplayChange);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      standalone.removeEventListener("change", onDisplayChange);
    };
  }, []);

  const dismiss = () => {
    setVisible(false);
    try { sessionStorage.setItem("smartcity-install-dismissed", "1"); } catch { /* Dismiss still works without storage. */ }
  };
  const install = async () => {
    if (!prompt) { setOpen(true); return; }
    setBusy(true);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") setVisible(false);
    } catch { setOpen(true); }
    finally { setPrompt(null); setBusy(false); }
  };

  if (!visible) return null;
  return (
    <>
      <aside aria-label="Install SmartCity app" className="mx-auto flex max-w-3xl items-center gap-3 border-b border-border bg-secondary px-4 py-3 text-secondary-foreground">
        <Download className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1"><p className="text-sm font-semibold">SmartCity Control</p><p className="text-xs text-muted-foreground">Add to your home screen</p></div>
        <Button onClick={install} disabled={busy} size="sm"><Download />{busy ? "Opening…" : "Install"}</Button>
        <Button variant="ghost" size="icon" onClick={dismiss} aria-label="Dismiss install notice" title="Dismiss install notice" className="shrink-0"><X /></Button>
      </aside>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Install SmartCity Control</DialogTitle><DialogDescription>
            {preview ? "Open the published website in your browser to install the app." : apple ? "In Safari, tap Share, then Add to Home Screen and Add." : "Open your browser menu and choose Install app or Add to Home screen. On desktop, look for the install icon in the address bar."}
          </DialogDescription></DialogHeader>
          {preview ? <Button asChild><a href="https://smartcity3d.lovable.app" target="_blank" rel="noopener noreferrer"><ExternalLink />Open SmartCity Control</a></Button> : apple ? <Share className="mx-auto h-6 w-6 text-primary" aria-hidden="true" /> : <p className="text-sm text-muted-foreground">If no install option appears, try Chrome on Android or desktop, or Safari on iPhone.</p>}
        </DialogContent>
      </Dialog>
    </>
  );
}