import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const h = vi.hoisted(() => ({
  plans: [] as unknown[],
  assignments: [] as unknown[],
  missing: false,
  apply: vi.fn(),
  setEnabled: vi.fn(),
  savePlan: vi.fn(),
  saveAssignment: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/useBusyWeek", () => {
  const m = (fn: (v: unknown) => void, ret?: (v: unknown) => unknown) => ({
    isPending: false,
    mutate: (vars: unknown, opts?: { onSuccess?: (r: unknown) => void }) => { fn(vars); opts?.onSuccess?.(ret ? ret(vars) : undefined); },
  });
  return {
    BUSY_SQL_MISSING_MSG: "Rode o SQL da Semana Corrida",
    useBusyWeekPlans: () => ({ data: { plans: h.plans, missingTable: h.missing }, isLoading: false }),
    useBusyWeekAssignments: () => ({ data: h.assignments }),
    useApplyBusyWeekPlan: () => m(h.apply),
    useSetBusyWeekEnabled: () => m(h.setEnabled),
    useSaveAssignmentPayload: () => m(h.saveAssignment),
    useSaveBusyWeekPlan: () => m(h.savePlan, (v) => ({ ...(v as object), id: "novo", updated_at: "2026-12-10T10:00:00Z" })),
  };
});
// Select do Radix trocado por botões simples (jsdom não abre o popover).
vi.mock("@/components/ui/select", async () => {
  const React = await import("react");
  const Ctx = React.createContext<(v: string) => void>(() => {});
  return {
    Select: ({ onValueChange, children }: { onValueChange: (v: string) => void; children: React.ReactNode }) =>
      React.createElement(Ctx.Provider, { value: onValueChange }, children),
    SelectTrigger: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
    SelectValue: () => null,
    SelectContent: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
    SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => {
      const set = React.useContext(Ctx);
      return React.createElement("button", { type: "button", onClick: () => set(value), "data-testid": `opt-${value}` }, children);
    },
  };
});
vi.mock("@/components/coach/busy-week/BusyWeekManager", () => ({ BusyWeekManager: () => null }));
vi.mock("@/components/coach/busy-week/BusyWeekPlanEditor", async () => {
  const React = await import("react");
  return {
    BusyWeekPlanEditor: (p: { open: boolean; title: string; onSave: (d: unknown) => void }) =>
      p.open
        ? React.createElement("button", { "data-testid": "fake-editor-save", onClick: () => p.onSave({ name: "FB Ana", kind: "fullbody", payload: { workouts: [] } }) }, p.title)
        : null,
  };
});

import { BusyWeekStudentCard } from "../busy-week/BusyWeekStudentCard";
import { emptyBusyPayload } from "@/lib/busyWeek";

const plan = { id: "p1", name: "Full Body Dez", kind: "fullbody", payload: emptyBusyPayload("fullbody"), updated_at: "2026-12-05T10:00:00Z" };
const assignment = (extra: Record<string, unknown> = {}) => ({
  id: "a1", student_id: "s1", coach_id: "c1", plan_id: "p1", plan_name: "Full Body Dez", kind: "fullbody",
  payload: plan.payload, plan_synced_at: "2026-12-05T10:00:00Z", customized: false, enabled: true,
  student_on: false, student_on_since: null, updated_at: "2026-12-05T10:00:00Z", ...extra,
});
const show = () => render(<BusyWeekStudentCard coachId="c1" studentId="s1" studentName="Ana Paula" />);

describe("Protocolo → aba Treinos → Semana Corrida da aluna", () => {
  beforeEach(() => {
    h.plans = [plan]; h.assignments = []; h.missing = false;
    [h.apply, h.setEnabled, h.savePlan, h.saveAssignment].forEach((f) => f.mockReset());
  });

  it("aparece no protocolo e avisa quando falta o SQL", () => {
    h.missing = true;
    show();
    expect(screen.getByTestId("busy-student-card")).toBeTruthy();
    expect(screen.getByTestId("busy-student-missing-sql").textContent).toMatch(/Rode o SQL/);
  });

  it("sem plano: escolhe da biblioteca e libera só para esta aluna", async () => {
    show();
    expect(screen.getByTestId("busy-student-empty")).toBeTruthy();
    expect(screen.getByTestId("busy-student-activate")).toBeDisabled();
    await userEvent.click(screen.getByTestId("opt-p1"));
    await userEvent.click(screen.getByTestId("busy-student-activate"));
    expect(h.apply).toHaveBeenCalledWith({ plan, studentIds: ["s1"] });
  });

  it("criar plano novo: salva na biblioteca e já libera para ela", async () => {
    h.plans = [];
    show();
    await userEvent.click(screen.getByTestId("busy-student-new"));
    await userEvent.click(screen.getByTestId("fake-editor-save"));
    expect(h.savePlan).toHaveBeenCalledWith(expect.objectContaining({ name: "FB Ana" }));
    expect(h.apply).toHaveBeenCalledWith({ plan: expect.objectContaining({ id: "novo" }), studentIds: ["s1"] });
  });

  it("com plano ativo: mostra treinos e status, ajusta só para ela e desativa", async () => {
    h.assignments = [assignment({ student_on: true, student_on_since: "2026-12-06T10:00:00Z" })];
    show();
    const box = screen.getByTestId("busy-student-active");
    expect(box.textContent).toMatch(/Full Body Dez/);
    expect(box.textContent).toMatch(/Usando desde 06\/12/);
    expect(box.textContent).toMatch(/Full Body A/);
    expect(box.textContent).toMatch(/faixa fixa/);
    await userEvent.click(within(box).getByTestId("busy-student-adjust"));
    await userEvent.click(screen.getByTestId("fake-editor-save"));
    expect(h.saveAssignment).toHaveBeenCalledWith({ studentId: "s1", payload: { workouts: [] } });
    await userEvent.click(screen.getByTestId("busy-student-disable"));
    expect(h.setEnabled).toHaveBeenCalledWith({ studentIds: ["s1"], enabled: false });
  });

  it("desativada: oferece reativar", async () => {
    h.assignments = [assignment({ enabled: false })];
    show();
    await userEvent.click(screen.getByRole("button", { name: "Reativar" }));
    expect(h.setEnabled).toHaveBeenCalledWith({ studentIds: ["s1"], enabled: true });
  });
});
