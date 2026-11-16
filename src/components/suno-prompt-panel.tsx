import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Copy, ExternalLink, Loader2, Music4, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { writeSunoPrompt } from "@/lib/ai-suno-prompt.functions";
import { fallbackSunoPrompt, SUNO_CREATE_URL, SUNO_PROMPT_MAX } from "@/lib/suno-prompt";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Writes a lyrics-free Suno prompt from the mood, then copies it and opens Suno. */
export function SunoPromptPanel({ mood }: { mood: string }) {
  const write = useServerFn(writeSunoPrompt);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [source, setSource] = useState<"ai" | "mood">("ai");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const writeWithAI = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await write({ data: { mood: mood.trim() } });
      if (result.ok) { setPrompt(result.prompt); setSource("ai"); }
      else setError(result.error);
    } catch {
      setError("Could not reach the AI service. Check your connection, or use a prompt written from your mood.");
    } finally {
      setBusy(false);
    }
  };

  const fromMood = () => {
    setError(null);
    setPrompt(fallbackSunoPrompt(mood));
    setSource("mood");
  };

  const copyAndOpen = async () => {
    if (!prompt) return;
    // Copy first while this page still has focus, then open Suno in a new tab.
    const copied = await copyText(prompt);
    window.open(SUNO_CREATE_URL, "_blank", "noopener,noreferrer");
    if (copied) toast.success("Prompt copied. Paste it into Suno's song description.");
    else toast.info("Suno is open. Copy the prompt below and paste it into Suno's song description.");
  };

  const copyOnly = async () => {
    if (prompt && (await copyText(prompt))) toast.success("Prompt copied");
    else toast.error("Couldn't copy. Select the prompt and copy it manually.");
  };

  return (
    <div className="space-y-3 rounded-2xl border border-border/60 p-3">
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold"><Music4 size={16} className="text-primary" />Full song with Suno</p>
        <p className="text-xs text-muted-foreground">
          A full modern song with vocals and music. AI writes a Suno prompt from your mood (no lyrics; Suno writes and sings them). Play the finished song on the karaoke speaker.
        </p>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Button onClick={() => { void writeWithAI(); }} disabled={busy} className="h-11 rounded-xl">
          {busy ? <Loader2 className="animate-spin" /> : <WandSparkles />}
          {busy ? "Writing prompt…" : "Write Suno prompt"}
        </Button>
        <Button variant="ghost" asChild className="glass-control h-11 rounded-xl">
          <a href={SUNO_CREATE_URL} target="_blank" rel="noopener noreferrer"><ExternalLink /> Suno</a>
        </Button>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error} <button type="button" onClick={fromMood} className="font-semibold underline">Use a prompt from my mood</button>
        </p>
      )}

      {prompt && (
        <div className="space-y-2" aria-live="polite">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {source === "ai" ? "Suno prompt by AI" : "Suno prompt from your mood"}
            </p>
            <span className="text-xs tabular-nums text-muted-foreground">{prompt.length}/{SUNO_PROMPT_MAX}</span>
          </div>
          <p className="select-all rounded-xl bg-muted/60 px-3 py-2 text-sm" data-testid="suno-prompt">{prompt}</p>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Button onClick={() => { void copyAndOpen(); }} className="h-11 rounded-xl"><ExternalLink /> Copy &amp; open Suno</Button>
            <Button variant="ghost" onClick={() => { void copyOnly(); }} className="glass-control h-11 rounded-xl"><Copy /> Copy</Button>
          </div>
          <p className="text-xs text-muted-foreground">In Suno, paste it into the song description, create the song, then play it here on the karaoke speaker.</p>
        </div>
      )}
    </div>
  );
}
