import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn() }));
vi.mock("@/lib/ai-party-music.functions", () => ({ composePartyMusic: {} }));
const { PartyModePanel } = await import("@/components/party-mode-panel");

afterEach(() => { cleanup(); });

describe("Party mode panel", () => {
  it("sends a built-in one-minute song to the city and starts the party", async () => {
    const onStart = vi.fn(async (_c: string[]) => {});
    render(<PartyModePanel connected demo={false} musicPlaying onStart={onStart} onStop={vi.fn(async () => {})} />);

    fireEvent.click(screen.getByRole("button", { name: /Built-in tune/ }));
    expect(screen.getByText(/BPM · 1:00/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Start party/ }));

    await waitFor(() => expect(onStart).toHaveBeenCalledOnce());
    const commands = onStart.mock.calls[0]![0];
    expect(commands[0]).toMatch(/^MB:\d+$/);
    expect(commands.at(-1)).toBe("MP:1");
    expect(await screen.findByRole("button", { name: /Stop party/ })).toBeInTheDocument();
  });

  it("can't start while disconnected", () => {
    render(<PartyModePanel connected={false} demo={false} musicPlaying={false} onStart={vi.fn()} onStop={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Built-in tune/ }));
    expect(screen.getByRole("button", { name: /Start party/ })).toBeDisabled();
  });
});
