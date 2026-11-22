import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const ctx = vi.fn();
vi.mock("@/hooks/useStudentContext", () => ({ useStudentContext: () => ctx() }));

import { StudentContextStrip } from "../protocol-builder/StudentContextStrip";
import { PrivacyProvider } from "@/components/coach/PrivacyMode";

const base = {
  goal: "Hipertrofia", injuries: "Dor no joelho", allergies: null, trainingDays: "4 dias", level: "Intermediário",
  weightKg: 62.4, weightSource: "checkin", weightAt: "2026-11-12T10:00:00Z", lastCheckinAt: "2026-11-12T10:00:00Z",
  anamnesisAt: "2026-10-01T10:00:00Z", hasAnamnesis: true,
};

describe("Faixa do aluno no topo do protocolo", () => {
  it("mostra objetivo, peso, check-in, treino e só os avisos que existem", async () => {
    ctx.mockReturnValue({ data: base, isLoading: false });
    const onOpen = vi.fn();
    render(<PrivacyProvider><StudentContextStrip studentId="s1" onOpenAnamnesis={onOpen} /></PrivacyProvider>);
    expect(screen.getByTestId("ctx-goal").textContent).toMatch(/Hipertrofia/);
    expect(screen.getByTestId("ctx-weight").textContent).toMatch(/62,4 kg/);
    expect(screen.getByTestId("ctx-training").textContent).toMatch(/4 dias · Intermediário/);
    expect(screen.getByTestId("ctx-injuries").textContent).toMatch(/Dor no joelho/);
    expect(screen.queryByTestId("ctx-allergies")).toBeNull();
    await userEvent.click(screen.getByTestId("student-context-anamnesis"));
    expect(onOpen).toHaveBeenCalled();
  });

  it("aluno sem anamnese nem check-in", () => {
    ctx.mockReturnValue({ data: { ...base, hasAnamnesis: false, lastCheckinAt: null }, isLoading: false });
    render(<PrivacyProvider><StudentContextStrip studentId="s1" onOpenAnamnesis={vi.fn()} /></PrivacyProvider>);
    expect(screen.getByTestId("student-context").textContent).toMatch(/Sem anamnese nem check-in ainda/);
  });
});
