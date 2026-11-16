/** three.js r128: the exact build bundled with the 3D model and the game, on its public CDN. */
export const THREE_R128_CDN = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";

/**
 * The 3D model and game load three.js from this website. For a download that works on its own,
 * point that one script tag at the same three.js build on the CDN; nothing else changes.
 */
export function toStandaloneHtml(html: string, localScriptSrc: string): string {
  const tag = `<script src="${localScriptSrc}"></script>`;
  if (!html.includes(tag)) throw new Error("The page's three.js script tag was not found.");
  return html.replace(tag, `<script src="${THREE_R128_CDN}"></script>`);
}

export async function downloadStandaloneHtml(url: string, localScriptSrc: string, fileName: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("The file could not be loaded.");
  const blob = new Blob([toStandaloneHtml(await response.text(), localScriptSrc)], { type: "text/html" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
}
