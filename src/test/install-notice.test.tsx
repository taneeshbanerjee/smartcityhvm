import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstallNotice } from "@/components/install-notice";

afterEach(() => { cleanup(); sessionStorage.clear(); vi.restoreAllMocks(); });

describe("Install notice behavior", () => {
  it("keeps the notice dismissed when remounted in the same session", () => {
    const view = render(<InstallNotice />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss install notice" }));
    view.unmount();
    render(<InstallNotice />);
    expect(screen.queryByRole("button", { name: "Install" })).toBeNull();
  });

  it("invokes the browser prompt and hides after acceptance", async () => {
    render(<InstallNotice />);
    const prompt = vi.fn(async () => {});
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome: "accepted" }) });
    fireEvent(window, event);
    expect(event.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Install" }));
    await waitFor(() => expect(prompt).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByRole("button", { name: "Install" })).toBeNull());
  });

  it("does not show an install notice in an installed app", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList);
    render(<InstallNotice />);
    expect(screen.queryByRole("button", { name: "Install" })).toBeNull();
  });

  it("hides after the browser confirms installation", () => {
    render(<InstallNotice />);
    fireEvent(window, new Event("appinstalled"));
    expect(screen.queryByRole("button", { name: "Install" })).toBeNull();
  });
});