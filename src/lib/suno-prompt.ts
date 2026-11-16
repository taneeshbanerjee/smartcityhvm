/**
 * Suno song prompts: a short music description (genre, mood, tempo, instruments, vocal style)
 * written from the operator's mood. It never contains lyrics; Suno writes and sings its own.
 * Suno has no API for filling in its prompt box, so the app copies the prompt and opens Suno.
 */

export const SUNO_CREATE_URL = "https://suno.com/create";
/** Fits Suno's "Song description" box. */
export const SUNO_PROMPT_MAX = 200;

/**
 * Clean a prompt so it is a single-line music description without lyrics: no section tags like
 * [Verse], no quoted lines, no line breaks. Returns null if nothing usable is left.
 */
export function normalizeSunoPrompt(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let text = value
    .replace(/\[[^\]]*\]/g, " ")          // [Verse], [Chorus] ...
    .replace(/\([^)]*\)/g, " ")           // (backing vocals) asides
    .replace(/["“”][^"“”]*["“”]/g, " ")   // quoted lines
    .replace(/^\s*(lyrics?|title)\s*:.*$/gim, " ")
    .replace(/[\r\n]+/g, ", ")
    .replace(/\s+/g, " ")
    .replace(/(\s*,\s*)+/g, ", ")
    .replace(/^[\s,.;:-]+|[\s,;:-]+$/g, "")
    .trim();
  if (text.length > SUNO_PROMPT_MAX) {
    const cut = text.slice(0, SUNO_PROMPT_MAX + 1);
    const end = Math.max(cut.lastIndexOf(","), cut.lastIndexOf(" "));
    text = cut.slice(0, end > 80 ? end : SUNO_PROMPT_MAX).replace(/[\s,;:-]+$/, "");
  }
  return text.length >= 12 ? text : null;
}

/** Used when AI isn't available: a style prompt built directly from the mood. */
export function fallbackSunoPrompt(mood: string): string {
  const m = mood.replace(/[\r\n"“”[\]()]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 90);
  const base = m ? `${m}, ` : "Upbeat celebration, ";
  return normalizeSunoPrompt(
    `${base}modern pop party anthem, catchy chorus, energetic female and male vocals, punchy drums, bright synths, 120 bpm, uplifting smart city festival vibe`,
  )!;
}
