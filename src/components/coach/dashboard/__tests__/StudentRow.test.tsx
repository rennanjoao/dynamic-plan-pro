import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StudentRow } from "../StudentRow";
import type { StudentStatus } from "@/hooks/useCoachStudents";
import { TooltipProvider } from "@/components/ui/tooltip";

const student = {
  id: "s1", name: "Maria Silva", alertLevel: "ok", daysInactive: 0, daysSinceLastFeedback: 3,
  currentWeight: 62, lastFeedback: "2026-11-10", goal: "Hipertrofia", awaitingReply: null,
} as unknown as StudentStatus;

const handlers = () => ({ onOpenProfile: vi.fn(), onProtocol: vi.fn(), onUnlink: vi.fn(), onLatestFeedback: vi.fn() });

describe("linha do aluno no painel do coach", () => {
  it("ações têm rótulo, menu leva às abas da ficha e Desvincular fica separado", async () => {
    const h = handlers();
    render(<TooltipProvider><StudentRow student={student} {...h} /></TooltipProvider>);
    await userEvent.click(screen.getByRole("button", { name: /^protocolo$/i }));
    expect(h.onProtocol).toHaveBeenCalled();
    expect(h.onUnlink).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /mais ações para maria silva/i }));
    for (const label of ["Abrir ficha do aluno", "Check-ins", "Evolução", "Postura", "Treinos", "Anamnese", "Desvincular aluno"]) {
      expect(await screen.findByText(label)).toBeTruthy();
    }
    await userEvent.click(screen.getByText("Postura"));
    expect(h.onOpenProfile).toHaveBeenCalledWith(student, "postura");
  });

  it("tocar no nome abre a ficha do aluno", async () => {
    const h = handlers();
    render(<TooltipProvider><StudentRow student={student} {...h} /></TooltipProvider>);
    await userEvent.click(screen.getByRole("button", { name: /abrir ficha de maria silva/i }));
    expect(h.onOpenProfile).toHaveBeenCalledWith(student);
  });

  it("check-in sem resposta: botão Responder passa na frente e abre o painel", async () => {
    const h = handlers();
    const since = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const pending = { ...student, awaitingReply: { count: 2, since } } as StudentStatus;
    render(<TooltipProvider><StudentRow student={pending} {...h} /></TooltipProvider>);
    expect(screen.getByText(/2 check-ins esperando resposta · há 2 dias/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^protocolo$/i })).toBeNull();
    await userEvent.click(screen.getByTestId("row-reply-button"));
    expect(h.onLatestFeedback).toHaveBeenCalledWith(pending);
  });
});
