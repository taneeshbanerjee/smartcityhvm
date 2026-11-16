import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initialState } from "@/lib/smartcity";

const generate = vi.fn();
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => generate }));
vi.mock("@/lib/ai-control-plan.functions", () => ({ generateAIControlPlan: {} }));

const { AIControlPlanPanel } = await import("@/components/ai-control-plan-panel");

afterEach(() => { cleanup(); generate.mockReset(); });

const plan = {
  title: "Evening assembly",
  summary: "Lights on for the evening with automatic control.",
  powerImpact: "Moderate",
  actions: [
    { device: "AUTO", enabled: true },
    { device: "BL", enabled: true },
    { device: "SL", enabled: true },
  ],
};

function describeSetup(text: string) {
  fireEvent.change(screen.getByLabelText("Describe the setup you want"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: /Create plan/ }));
}

describe("AI control plan panel", () => {
  it("previews the plan and sends only changed commands, Auto mode last, when applied", async () => {
    generate.mockResolvedValue({ ok: true, plan });
    const onApply = vi.fn(async () => {});
    render(<AIControlPlanPanel state={{ ...initialState, BL: true }} connected onApply={onApply} />);

    describeSetup("Evening assembly lights");

    expect(await screen.findByText("Evening assembly")).toBeInTheDocument();
    expect(generate).toHaveBeenCalledWith({ data: { description: "Evening assembly lights" } });
    expect(screen.getByText("Moderate power")).toBeInTheDocument();
    expect(screen.getByText(/Already on/)).toBeInTheDocument();
    expect(screen.getByTitle("3D preview of our city with this plan applied")).toHaveAttribute("src", "/smart-city-model/index.html?preview=1");
    expect(onApply).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Apply 2 changes" }));
    await waitFor(() => expect(onApply).toHaveBeenCalledWith(["SL:1", "AUTO:1"]));
  });

  it("keeps the plan preview-only while disconnected", async () => {
    generate.mockResolvedValue({ ok: true, plan });
    render(<AIControlPlanPanel state={initialState} connected={false} onApply={vi.fn()} />);

    describeSetup("Evening assembly lights");

    expect(await screen.findByRole("button", { name: "Apply 3 changes" })).toBeDisabled();
    expect(screen.getByText(/Connect to the city or start Demo mode/)).toBeInTheDocument();
  });

  it("shows the service error without a preview", async () => {
    generate.mockResolvedValue({ ok: false, status: 429, error: "The plan service is busy. Please try again later." });
    render(<AIControlPlanPanel state={initialState} connected onApply={vi.fn()} />);

    describeSetup("Night mode");

    expect(await screen.findByRole("alert")).toHaveTextContent("The plan service is busy");
    expect(screen.queryByText("Plan preview")).toBeNull();
  });
});
