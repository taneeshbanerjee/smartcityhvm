import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CreditBadge } from "@/components/credit-badge";
import { showCreditBadgeOn } from "@/lib/credit-badge";

afterEach(() => { cleanup(); sessionStorage.clear(); });

describe("Edited by Taneesh badge", () => {
  it("shows the credit and stays closed for the session after ✕", () => {
    const view = render(<CreditBadge pathname="/" />);
    expect(screen.getByText("Edited by Taneesh")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close the Edited by Taneesh badge" }));
    expect(screen.queryByText("Edited by Taneesh")).toBeNull();
    view.unmount();
    render(<CreditBadge pathname="/" />);
    expect(screen.queryByText("Edited by Taneesh")).toBeNull();
  });

  it("is hidden on the game, 3D, hydro dam template and circuit diagram pages, shown everywhere else", () => {
    for (const path of ["/game", "/model", "/heading-board", "/hydro-dam-template", "/circuit-diagram", "/game/"]) expect(showCreditBadgeOn(path)).toBe(false);
    for (const path of ["/", "/launch-video", "/esp32-code", "/voice-agent"]) expect(showCreditBadgeOn(path)).toBe(true);
    render(<CreditBadge pathname="/game" />);
    expect(screen.queryByText("Edited by Taneesh")).toBeNull();
  });

  it("hides for the session as soon as any button on the website is pressed", () => {
    const view = render(
      <div>
        <button type="button">Connect</button>
        <a href="/circuit-diagram">Circuit diagram</a>
        <p>Plain text</p>
        <CreditBadge pathname="/" />
      </div>,
    );
    fireEvent.click(screen.getByText("Plain text"));
    expect(screen.getByText("Edited by Taneesh")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(screen.queryByText("Edited by Taneesh")).toBeNull();
    view.unmount();
    render(<CreditBadge pathname="/" />);
    expect(screen.queryByText("Edited by Taneesh")).toBeNull();
  });

  it("also hides when a button-style link is pressed", () => {
    render(<div><a href="#files">Launch video</a><CreditBadge pathname="/" /></div>);
    fireEvent.click(screen.getByText("Launch video"));
    expect(screen.queryByText("Edited by Taneesh")).toBeNull();
  });
});
