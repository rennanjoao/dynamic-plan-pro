import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StudentRow } from "../StudentRow";
import { TooltipProvider } from "@/components/ui/tooltip";

const student = {
  id: "s1", name: "Maria Silva", alertLevel: "ok", daysInactive: 0, daysSinceLastFeedback: 3,
  currentWeight: 62, lastFeedback: "2026-11-10", goal: "Hipertrofia",
} as any;

describe("linha do aluno no painel do coach", () => {
  it("ações têm rótulo e Desvincular fica separado no menu", async () => {
    const h = { onAnamnesis: vi.fn(), onProtocol: vi.fn(), onUnlink: vi.fn(), onHistory: vi.fn(), onEngagement: vi.fn(), onLatestFeedback: vi.fn() };
    render(<TooltipProvider><StudentRow student={student} {...h} /></TooltipProvider>);
    await userEvent.click(screen.getByRole("button", { name: /protocolo/i }));
    expect(h.onProtocol).toHaveBeenCalled();
    expect(h.onUnlink).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /mais ações para maria silva/i }));
    for (const label of ["Anamnese", "Histórico de check-ins", "Engajamento", "Desvincular aluno"]) {
      expect(await screen.findByText(label)).toBeTruthy();
    }
    await userEvent.click(screen.getByText("Histórico de check-ins"));
    expect(h.onHistory).toHaveBeenCalled();
  });
});
