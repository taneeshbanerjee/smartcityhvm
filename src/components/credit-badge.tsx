import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { showCreditBadgeOn } from "@/lib/credit-badge";

const DISMISS_KEY = "smartcity-credit-dismissed";

/**
 * Small "Edited by Taneesh" credit in the bottom-right corner, raised to sit just above the
 * hosting badge Lovable shows there (so neither covers the other); ✕ hides it for this session.
 * Not shown on the game and 3D pages.
 */
export function CreditBadge({ pathname }: { pathname: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try { dismissed = sessionStorage.getItem(DISMISS_KEY) === "1"; } catch { /* Storage can be unavailable. */ }
    setVisible(!dismissed);
  }, []);

  const dismiss = () => {
    setVisible(false);
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch { /* Storage can be unavailable. */ }
  };

  if (!visible || !showCreditBadgeOn(pathname)) return null;
  return (
    <div
      role="note"
      aria-label="Edited by Taneesh"
      className="fixed right-3 bottom-14 z-40 flex items-center gap-1 rounded-md border border-border/70 bg-background/90 py-1 pr-1 pl-2.5 text-xs font-medium text-foreground shadow-card backdrop-blur-xl print:hidden"
      style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <span>Edited by Taneesh</span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Close the Edited by Taneesh badge"
        className="grid h-6 w-6 place-items-center rounded text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        <X size={14} />
      </button>
    </div>
  );
}
