import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SetupNotice } from "./SetupNotice";

describe("SetupNotice", () => {
  it("names the variable the operator has to set", () => {
    render(<SetupNotice ribbonAddress={null} />);
    expect(screen.getAllByText("VITE_RIBBON_ADDRESS").length).toBeGreaterThan(0);
  });

  it("stays quiet once the contract address exists", () => {
    const view = render(<SetupNotice ribbonAddress="0x3600000000000000000000000000000000000000" />);
    expect(view.container.textContent).toBe("");
  });
});
