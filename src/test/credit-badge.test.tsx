import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CreditBadge } from "@/components/credit-badge";

afterEach(() => { cleanup(); sessionStorage.clear(); });

describe("Edited by Tanish badge", () => {
  it("shows the credit and stays closed for the session after ✕", () => {
    const view = render(<CreditBadge />);
    expect(screen.getByText("Edited by Tanish")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close the Edited by Tanish badge" }));
    expect(screen.queryByText("Edited by Tanish")).toBeNull();
    view.unmount();
    render(<CreditBadge />);
    expect(screen.queryByText("Edited by Tanish")).toBeNull();
  });
});
