import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { StudentStatus } from "@/hooks/useCoachStudents";
import { TooltipProvider } from "@/components/ui/tooltip";

vi.mock("@/components/coach/student-profile/StudentCycleSummary", () => ({ default: () => <div>RESUMO</div> }));
vi.mock("../StudentEngagementDialog", () => ({ StudentEngagementContent: () => <div>ENGAJAMENTO</div> }));
vi.mock("../CheckinHistoryDialog", () => ({
  CheckinHistoryList: ({ onOpenCheckin }: { onOpenCheckin: (id: string) => void }) => (
    <button onClick={() => onOpenCheckin("c9")}>RESPONDER_C9</button>
  ),
}));
vi.mock("@/components/coach/posture/PostureQuickTab", () => ({ default: () => <div>POSTURA</div> }));
vi.mock("@/components/coach/EvolutionComparison", () => ({ default: () => <div>EVOLUCAO</div> }));
vi.mock("@/components/coach/StudentWorkoutAnalytics", () => ({ default: () => <div>TREINOS</div> }));
vi.mock("@/components/anamnesis/AnamnesisViewer", () => ({ default: () => <div>ANAMNESE</div> }));
vi.mock("@/hooks/useStudentCycleSummary", () => ({ useStudentCycleSummary: () => ({ data: null, isLoading: false }) }));

import { StudentProfileSheet } from "../StudentProfileSheet";

const student = {
  id: "s1", name: "Maria Silva", alertLevel: "ok", daysInactive: 0, daysSinceLastFeedback: 2,
  lastFeedback: "2026-11-17", goal: "emagrecer", currentWeight: 60,
  awaitingReply: { count: 1, since: new Date(Date.now() - 86_400_000).toISOString() },
  weightTrend: { deltaKg: null, direction: null, isStagnant: false },
} as unknown as StudentStatus;

function show(props: Partial<React.ComponentProps<typeof StudentProfileSheet>> = {}) {
  const h = { onReply: vi.fn(), onEditProtocol: vi.fn(), onConfigure: vi.fn(), onClose: vi.fn() };
  render(
    <TooltipProvider>
      <StudentProfileSheet student={student} open coachId="c1" {...h} {...props} />
    </TooltipProvider>,
  );
  return h;
}

describe("ficha do aluno", () => {
  it("tem as 7 abas e abre no Resumo", () => {
    show();
    for (const t of ["Resumo", "Check-ins", "Evolução", "Postura", "Treinos", "Protocolo", "Anamnese"]) {
      expect(screen.getByRole("tab", { name: t })).toBeTruthy();
    }
    expect(screen.getByText("RESUMO")).toBeTruthy();
  });

  it("abre direto na aba pedida (ex.: Postura pelo menu da linha)", async () => {
    show({ initialTab: "postura" });
    expect(await screen.findByText("POSTURA")).toBeTruthy();
  });

  it("check-in pendente: botão no topo abre o painel; no histórico abre o check-in escolhido", async () => {
    const h = show();
    await userEvent.click(screen.getByRole("button", { name: /Responder check-in · ontem/ }));
    expect(h.onReply).toHaveBeenCalledWith(student);
    await userEvent.click(screen.getByRole("tab", { name: "Check-ins" }));
    await userEvent.click(await screen.findByText("RESPONDER_C9"));
    expect(h.onReply).toHaveBeenLastCalledWith(student, "c9");
  });

  it("Treinos da aluna ficam dentro da ficha (não precisa ir em outra aba do painel)", async () => {
    show();
    await userEvent.click(screen.getByRole("tab", { name: "Treinos" }));
    expect(await screen.findByText("TREINOS")).toBeTruthy();
  });
});
