import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const h = vi.hoisted(() => ({
  plans: [] as unknown[],
  assignments: [] as unknown[],
  apply: vi.fn(),
  setEnabled: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/coach/PrivacyMode", () => ({ Private: ({ children }: { children: unknown }) => children }));
vi.mock("@/hooks/useCoachStudents", () => ({
  useCoachStudentsLite: () => ({ data: [{ id: "s1", name: "Ana" }, { id: "s2", name: "Bia" }, { id: "s3", name: "Carla" }] }),
}));
vi.mock("@/components/coach/busy-week/BusyWeekPlanEditor", () => ({ BusyWeekPlanEditor: () => null }));
vi.mock("@/hooks/useBusyWeek", () => {
  const m = (fn?: ReturnType<typeof vi.fn>) => ({ mutate: fn ?? vi.fn(), isPending: false });
  return {
    BUSY_SQL_MISSING_MSG: "SQL faltando",
    useBusyWeekPlans: () => ({ data: { plans: h.plans, missingTable: false }, isLoading: false }),
    useBusyWeekAssignments: () => ({ data: h.assignments }),
    useSaveBusyWeekPlan: () => m(),
    useDeleteBusyWeekPlan: () => m(),
    useApplyBusyWeekPlan: () => m(h.apply),
    useSetBusyWeekEnabled: () => m(h.setEnabled),
    useSaveAssignmentPayload: () => m(),
  };
});

import { ConfirmProvider } from "@/components/ConfirmProvider";
import { BusyWeekManager } from "../busy-week/BusyWeekManager";
import { emptyBusyPayload } from "@/lib/busyWeek";

const plan = { id: "p1", name: "Full Body Dez", kind: "fullbody", payload: emptyBusyPayload("fullbody"), updated_at: "2026-12-05T10:00:00Z" };
const assignment = (student_id: string, extra: Record<string, unknown> = {}) => ({
  id: `a-${student_id}`, student_id, coach_id: "c1", plan_id: "p1", plan_name: "Full Body Dez", kind: "fullbody",
  payload: plan.payload, plan_synced_at: "2026-12-05T10:00:00Z", customized: false, enabled: true,
  student_on: false, student_on_since: null, updated_at: "2026-12-05T10:00:00Z", ...extra,
});

const show = () => render(<ConfirmProvider><BusyWeekManager open onOpenChange={() => {}} coachId="c1" /></ConfirmProvider>);

describe("Semana Corrida — biblioteca do coach", () => {
  beforeEach(() => { h.plans = [plan]; h.assignments = []; h.apply.mockReset(); h.setEnabled.mockReset(); });

  it("lista o plano com tipo, treinos e quantas alunas usam", () => {
    h.assignments = [assignment("s1")];
    show();
    const card = screen.getByTestId("busy-plan-p1");
    expect(card.textContent).toMatch(/Full Body Dez/);
    expect(card.textContent).toMatch(/Full Body · 2 treino\(s\) · 3x\/semana · faixa fixa/);
    expect(within(card).getByText("1")).toBeTruthy();
  });

  it("ativar para várias alunas de uma vez (avisa quem já usa outro plano)", async () => {
    h.assignments = [assignment("s3", { plan_id: "outro", plan_name: "Upper Lower" })];
    show();
    await userEvent.click(screen.getByTestId("busy-activate-p1"));
    const picker = await screen.findByTestId("busy-student-picker");
    expect(within(picker).getByText(/Hoje usa: Upper Lower/)).toBeTruthy();
    await userEvent.click(within(picker).getByTestId("pick-s1"));
    await userEvent.click(within(picker).getByTestId("pick-s2"));
    await userEvent.click(within(picker).getByTestId("busy-picker-confirm"));
    expect(h.apply).toHaveBeenCalledTimes(1);
    const [{ plan: p, studentIds }] = h.apply.mock.calls[0];
    expect(p.id).toBe("p1");
    expect(studentIds.sort()).toEqual(["s1", "s2"]);
  });

  it("atualizar nas alunas: quem tem ajuste individual vem desmarcada", async () => {
    h.assignments = [assignment("s1"), assignment("s2", { customized: true })];
    show();
    await userEvent.click(screen.getByTestId("busy-sync-p1"));
    const picker = await screen.findByTestId("busy-student-picker");
    expect(within(picker).getByText(/ajuste será substituído/)).toBeTruthy();
    await userEvent.click(within(picker).getByTestId("busy-picker-confirm"));
    expect(h.apply.mock.calls[0][0].studentIds).toEqual(["s1"]);
  });

  it("aba Alunas mostra se ela está usando, ajuste e versão anterior; desativar", async () => {
    h.plans = [{ ...plan, updated_at: "2026-12-08T10:00:00Z" }];
    h.assignments = [
      assignment("s1", { student_on: true, student_on_since: "2026-12-06T10:00:00Z", customized: true }),
      assignment("s2", { enabled: false }),
    ];
    show();
    await userEvent.click(screen.getByRole("tab", { name: /Alunas/ }));
    const ana = await screen.findByTestId("busy-assignment-s1");
    expect(ana.textContent).toMatch(/Usando desde 06\/12/);
    expect(ana.textContent).toMatch(/Ajustado só pra ela/);
    expect(ana.textContent).toMatch(/Versão anterior/);
    expect(screen.getByTestId("busy-assignment-s2").textContent).toMatch(/Desativado/);
    await userEvent.click(screen.getByTestId("busy-toggle-s1"));
    expect(h.setEnabled).toHaveBeenCalledWith({ studentIds: ["s1"], enabled: false }, expect.anything());
  });
});
