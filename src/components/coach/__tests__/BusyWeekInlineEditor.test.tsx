import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const h = vi.hoisted(() => ({
  plans: [] as unknown[],
  assignments: [] as unknown[],
  missing: false,
  upsert: vi.fn(),
  setEnabled: vi.fn(),
  savePlan: vi.fn(),
  editorPayload: null as unknown,
  setPayload: null as null | ((p: unknown) => void),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/useBusyWeek", () => {
  const m = (fn: (v: unknown) => void) => ({
    isPending: false,
    mutate: (vars: unknown, opts?: { onSuccess?: (r: unknown) => void }) => { fn(vars); opts?.onSuccess?.(undefined); },
    mutateAsync: async (vars: unknown) => { fn(vars); },
  });
  return {
    BUSY_SQL_MISSING_MSG: "Rode o SQL da Semana Corrida",
    useBusyWeekPlans: () => ({ data: { plans: h.plans, missingTable: h.missing }, isLoading: false }),
    useBusyWeekAssignments: () => ({ data: h.assignments, isLoading: false }),
    useUpsertStudentBusyWeek: () => m(h.upsert),
    useSetBusyWeekEnabled: () => m(h.setEnabled),
    useSaveBusyWeekPlan: () => m(h.savePlan),
  };
});
// Editor de treinos real é coberto nos testes do WorkoutsTab; aqui só capturamos o payload.
vi.mock("@/components/coach/protocol-builder/WorkoutsTab", async () => {
  const React = await import("react");
  return {
    WorkoutsTab: (p: { payload: unknown; setPayload: (x: unknown) => void; variant?: string }) => {
      h.editorPayload = p.payload;
      h.setPayload = p.setPayload;
      return React.createElement("div", { "data-testid": "fake-workouts-tab", "data-variant": p.variant });
    },
  };
});
vi.mock("@/components/coach/busy-week/BusyWeekManager", () => ({ BusyWeekManager: () => null }));
vi.mock("@/components/ui/select", async () => {
  const React = await import("react");
  const Ctx = React.createContext<(v: string) => void>(() => {});
  return {
    Select: ({ onValueChange, children }: { onValueChange?: (v: string) => void; children: React.ReactNode }) =>
      React.createElement(Ctx.Provider, { value: onValueChange ?? (() => {}) }, children),
    SelectTrigger: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
    SelectValue: () => null,
    SelectContent: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
    SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => {
      const set = React.useContext(Ctx);
      return React.createElement("button", { type: "button", onClick: () => set(value), "data-testid": `opt-${value}` }, children);
    },
  };
});

import { ConfirmProvider } from "@/components/ConfirmProvider";
import { createRef } from "react";
import { act } from "@testing-library/react";
import { BusyWeekInlineEditor, type BusyWeekInlineHandle } from "../busy-week/BusyWeekInlineEditor";
import { emptyBusyPayload, normalizeBusyPayload } from "@/lib/busyWeek";

const filled = normalizeBusyPayload({
  workouts: [
    { key: "SC_A", focus: "Full Body A", exercises: [{ name: "Agachamento", __id: "e1" }] },
    { key: "SC_B", focus: "Full Body B", exercises: [{ name: "Terra", __id: "e2" }] },
  ],
});
const plan = { id: "p1", name: "FB Dez", kind: "fullbody", payload: filled, updated_at: "2026-12-05T10:00:00Z" };
const assignment = (extra: Record<string, unknown> = {}) => ({
  id: "a1", student_id: "s1", coach_id: "c1", plan_id: null, plan_name: "Semana Corrida", kind: "fullbody",
  payload: filled, plan_synced_at: null, customized: false, enabled: true,
  student_on: false, student_on_since: null, updated_at: "2026-12-05T10:00:00Z", ...extra,
});
const protocolWorkouts = [
  { key: "A", focus: "Pernas", exercises: [{ name: "Leg press", __id: "x1" }] },
  { key: "B", focus: "Costas", exercises: [{ name: "Remada", __id: "x2" }] },
] as never;

const show = () => render(
  <ConfirmProvider>
    <BusyWeekInlineEditor coachId="c1" studentId="s1" studentName="Ana Paula" protocolWorkouts={protocolWorkouts} />
  </ConfirmProvider>,
);

type Editor = { workouts: Array<{ key: string; focus: string; exercises: Array<{ name: string }> }>; weekDays: Record<string, string>; carbCycle: Record<string, string> };

describe("Protocolo → Treinos → Semana corrida", () => {
  beforeEach(() => {
    h.plans = [plan]; h.assignments = []; h.missing = false; h.editorPayload = null;
    [h.upsert, h.setEnabled, h.savePlan].forEach((f) => f.mockReset());
  });

  it("avisa quando falta o SQL", () => {
    h.missing = true;
    show();
    expect(screen.getByTestId("busy-inline-missing-sql")).toBeTruthy();
  });

  it("copiar do treino atual: abre o mesmo editor com os treinos e a semana A·descanso·B, e salvar libera para ela", async () => {
    show();
    await userEvent.click(screen.getByTestId("busy-inline-from-protocol"));
    expect(screen.getByTestId("fake-workouts-tab").dataset.variant).toBe("busyWeek");
    const ed = h.editorPayload as Editor;
    expect(ed.workouts.map((w) => w.key)).toEqual(["SC_A", "SC_B"]);
    expect(ed.workouts[0].exercises[0].name).toBe("Leg press");
    expect(ed.weekDays).toMatchObject({ seg: "SC_A", ter: "REST", qua: "SC_B", sex: "SC_A" });
    expect(ed.carbCycle).toMatchObject({ seg: "base", ter: "off" });
    await userEvent.click(screen.getByTestId("busy-inline-save"));
    const call = h.upsert.mock.calls[0][0];
    expect(call).toMatchObject({ studentId: "s1", planId: null, kind: "fullbody", customized: false });
    expect(call.payload.weekDays.seg).toBe("SC_A");
  });

  it("o carbo é ajustado na faixa da semana do editor e vai junto ao salvar", async () => {
    h.assignments = [assignment()];
    show();
    expect(screen.queryByTestId("busy-inline-savebar")).toBeNull(); // sem alteração, sem barra
    const ed = h.editorPayload as Editor;
    h.setPayload!({ ...ed, carbCycle: { ...ed.carbCycle, seg: "high" } });
    await userEvent.click(await screen.findByTestId("busy-inline-save"));
    expect(h.upsert.mock.calls[0][0].payload.carbCycle.seg).toBe("high");
  });

  it("usar modelo da biblioteca e salvar sem mudar: não marca como ajustada", async () => {
    show();
    await userEvent.click(screen.getByTestId("opt-p1"));
    await userEvent.click(screen.getByTestId("busy-inline-save"));
    expect(h.upsert.mock.calls[0][0]).toMatchObject({ planId: "p1", planName: "FB Dez", customized: false, planSyncedAt: plan.updated_at });
  });

  it("montar do zero: começa com 2 treinos vazios e não deixa salvar sem exercícios", async () => {
    show();
    await userEvent.click(screen.getByTestId("busy-inline-from-scratch"));
    expect((h.editorPayload as Editor).workouts).toHaveLength(2);
    await userEvent.click(screen.getByTestId("busy-inline-save"));
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("desativada: oferece reativar", async () => {
    h.assignments = [assignment({ enabled: false })];
    show();
    await userEvent.click(screen.getByRole("button", { name: "Reativar" }));
    expect(h.setEnabled).toHaveBeenCalledWith({ studentIds: ["s1"], enabled: true });
  });

  it("plano vazio de Upper/Lower tem nomes próprios", () => {
    expect(emptyBusyPayload("upper_lower").workouts[1].focus).toMatch(/Lower/);
  });

  it("Salvar/Publicar do protocolo salva junto a Semana Corrida pendente (bug Mayane)", async () => {
    h.assignments = [assignment()];
    const ref = createRef<BusyWeekInlineHandle>();
    render(
      <ConfirmProvider>
        <BusyWeekInlineEditor ref={ref} coachId="c1" studentId="s1" studentName="Mayane" protocolWorkouts={protocolWorkouts} />
      </ConfirmProvider>,
    );
    // Sem mudança: nada a salvar, segue o publish.
    await act(async () => { expect(await ref.current!.saveIfDirty()).toBe(true); });
    expect(h.upsert).not.toHaveBeenCalled();
    const ed = h.editorPayload as Editor;
    act(() => h.setPayload!({ ...ed, workouts: ed.workouts.map((w, i) => (i === 0 ? { ...w, focus: "Glúteo foco" } : w)) }));
    expect(ref.current!.hasUnsaved()).toBe(true);
    await act(async () => { expect(await ref.current!.saveIfDirty()).toBe(true); });
    expect(h.upsert).toHaveBeenCalledTimes(1);
    expect(h.upsert.mock.calls[0][0].payload.workouts[0].focus).toBe("Glúteo foco");
    expect(h.upsert.mock.calls[0][0].payload.workouts).toHaveLength(2);
  });

  it("dados com campo nulo vindos do treino atual não somem ao copiar e salvar", async () => {
    show();
    const dirty = [
      { key: "A", focus: "Pernas", exercises: [{ name: "Leg press", __id: "x1", gifKey: null, notes: null, sets: 4 }] },
    ] as never;
    render(
      <ConfirmProvider>
        <BusyWeekInlineEditor coachId="c1" studentId="s2" studentName="Bia" protocolWorkouts={dirty} />
      </ConfirmProvider>,
    );
    const buttons = screen.getAllByTestId("busy-inline-from-protocol");
    await userEvent.click(buttons[buttons.length - 1]);
    const saves = screen.getAllByTestId("busy-inline-save");
    await userEvent.click(saves[saves.length - 1]);
    const call = h.upsert.mock.calls.at(-1)![0];
    expect(call.studentId).toBe("s2");
    expect(call.payload.workouts[0].exercises[0]).toMatchObject({ name: "Leg press", sets: "4" });
  });
});
