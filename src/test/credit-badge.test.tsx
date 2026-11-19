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

  it("is hidden on the game and 3D pages, shown everywhere else", () => {
    for (const path of ["/game", "/model", "/heading-board", "/game/"]) expect(showCreditBadgeOn(path)).toBe(false);
    for (const path of ["/", "/circuit-diagram", "/hydro-dam-template", "/launch-video", "/esp32-code"]) expect(showCreditBadgeOn(path)).toBe(true);
    render(<CreditBadge pathname="/game" />);
    expect(screen.queryByText("Edited by Taneesh")).toBeNull();
  });
});
