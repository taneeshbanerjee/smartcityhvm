import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const writePrompt = vi.fn();
const composeMusic = vi.fn();
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: { name?: string }) => (fn.name === "suno" ? writePrompt : composeMusic) }));
vi.mock("@/lib/ai-party-music.functions", () => ({ composePartyMusic: { name: "music" } }));
vi.mock("@/lib/ai-suno-prompt.functions", () => ({ writeSunoPrompt: { name: "suno" } }));
const { PartyModePanel } = await import("@/components/party-mode-panel");

afterEach(() => { cleanup(); vi.restoreAllMocks(); writePrompt.mockReset(); });

describe("Party mode panel", () => {
  it("sends a built-in one-minute song to the city and starts the party", async () => {
    const onStart = vi.fn(async (_c: string[]) => {});
    render(<PartyModePanel connected demo={false} musicPlaying onStart={onStart} onStop={vi.fn(async () => {})} />);

    fireEvent.click(screen.getByRole("button", { name: /Built-in tune/ }));
    expect(screen.getByText(/BPM · 1:00/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Start party/ }));

    // the notes go first; MP:1 is sent on its own, right as the phone starts the tune
    await waitFor(() => expect(onStart).toHaveBeenCalledTimes(2));
    const upload = onStart.mock.calls[0]![0];
    expect(upload[0]).toMatch(/^MB:\d+$/);
    expect(upload.slice(1).every((c) => c.startsWith("MA:"))).toBe(true);
    expect(onStart.mock.calls[1]![0]).toEqual(["MP:1"]);
    expect(await screen.findByRole("button", { name: /Stop party/ })).toBeInTheDocument();
  });

  it("can't start while disconnected", () => {
    render(<PartyModePanel connected={false} demo={false} musicPlaying={false} onStart={vi.fn()} onStop={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Built-in tune/ }));
    expect(screen.getByRole("button", { name: /Start party/ })).toBeDisabled();
  });

  it("writes a Suno prompt from the mood, copies it and opens Suno", async () => {
    writePrompt.mockResolvedValue({ ok: true, prompt: "Upbeat Bollywood dance pop, 126 bpm, dhol, bright synths, energetic vocals" });
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    render(<PartyModePanel connected={false} demo={false} musicPlaying={false} onStart={vi.fn()} onStop={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Describe the party music"), { target: { value: "bollywood dance" } });
    fireEvent.click(screen.getByRole("button", { name: /Write Suno prompt/ }));
    expect(await screen.findByTestId("suno-prompt")).toHaveTextContent("Upbeat Bollywood dance pop");
    expect(writePrompt).toHaveBeenCalledWith({ data: { mood: "bollywood dance" } });

    fireEvent.click(screen.getByRole("button", { name: /Copy & open Suno/ }));
    await waitFor(() => expect(open).toHaveBeenCalledWith("https://suno.com/create", "_blank", "noopener,noreferrer"));
    expect(writeText).toHaveBeenCalledWith("Upbeat Bollywood dance pop, 126 bpm, dhol, bright synths, energetic vocals");
  });

  it("falls back to a prompt written from the mood when AI fails", async () => {
    writePrompt.mockResolvedValue({ ok: false, status: 429, error: "The AI service is busy." });
    render(<PartyModePanel connected={false} demo={false} musicPlaying={false} onStart={vi.fn()} onStop={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Describe the party music"), { target: { value: "festival drums" } });
    fireEvent.click(screen.getByRole("button", { name: /Write Suno prompt/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Use a prompt from my mood" }));
    expect(screen.getByTestId("suno-prompt").textContent).toMatch(/^festival drums, /);
  });
});
