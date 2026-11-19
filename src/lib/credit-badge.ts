/** Full-screen game and 3D pages where the credit badge would cover controls or the model. */
const HIDDEN_ON = ["/game", "/model", "/heading-board"];

export function showCreditBadgeOn(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return !HIDDEN_ON.includes(path);
}
