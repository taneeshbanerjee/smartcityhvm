/** Full-screen game and 3D pages where the credit badge would cover controls or the model. */
const HIDDEN_ON = ["/game", "/model", "/heading-board"];

/** Anything a person presses like a button: buttons, button-style links, switches, tabs and form buttons. */
export const BUTTON_SELECTOR = [
  "button", "a[href]", '[role="button"]', '[role="switch"]', '[role="tab"]', '[role="menuitem"]', '[role="option"]',
  'input[type="button"]', 'input[type="submit"]', 'input[type="reset"]', 'input[type="checkbox"]', 'input[type="radio"]', "summary",
].join(",");

export function showCreditBadgeOn(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return !HIDDEN_ON.includes(path);
}
