/**
 * Full screen + landscape lock for the launch video on phones and tablets.
 * Browsers only allow locking the orientation while the page is full screen, and only after a
 * tap, so enterLandscape() must be called from a click handler. iPhones don't let websites lock
 * the orientation; there the page simply asks the viewer to turn the phone.
 */
type LockableOrientation = ScreenOrientation & { lock?: (orientation: "landscape") => Promise<void>; unlock?: () => void };

const orientation = () => (typeof screen !== "undefined" ? (screen.orientation as LockableOrientation | undefined) : undefined);

/** Touch device whose browser can go full screen and lock the orientation (e.g. Android Chrome). */
export function canLockLandscape(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  const touch = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  return touch && typeof document.documentElement.requestFullscreen === "function" && typeof orientation()?.lock === "function";
}

/** Go full screen and lock to landscape. Returns true when the screen is now locked to landscape. */
export async function enterLandscape(): Promise<boolean> {
  if (!canLockLandscape()) return false;
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    await orientation()!.lock!("landscape");
    return true;
  } catch {
    return false;
  }
}

/** Undo enterLandscape(): release the orientation and leave full screen. */
export async function leaveLandscape(): Promise<void> {
  try { orientation()?.unlock?.(); } catch { /* not locked */ }
  if (typeof document !== "undefined" && document.fullscreenElement === document.documentElement) {
    await document.exitFullscreen().catch(() => {});
  }
}
