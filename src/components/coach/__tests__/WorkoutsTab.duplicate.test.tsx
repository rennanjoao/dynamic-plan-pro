import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/coach/ExercisePickerInput", () => ({ ExercisePickerInput: ({ value }: { value: string }) => <span>{value}</span> }));
vi.mock("@/components/coach/ExerciseSubstitutesPopover", () => ({ ExerciseSubstitutesPopover: () => null }));
vi.mock("@/components/coach/CoachExerciseLibraryDialog", () => ({ CoachExerciseLibraryDialog: () => null }));
vi.mock("@/components/coach/MobilityTemplateBar", () => ({ MobilityTemplateBar: () => null }));
vi.mock("@/components/coach/WorkoutTemplateQuickPicker", () => ({ WorkoutTemplateQuickPicker: () => null }));
vi.mock("@/components/coach/PeriodizationTemplateQuickPicker", () => ({ PeriodizationTemplateQuickPicker: () => null }));
vi.mock("../WorkoutPeriodizationEditor", () => ({ default: () => null }));
vi.mock("../protocol-builder/WeeklyVolumeDashboard", () => ({ WeeklyVolumeDashboard: () => null }));

import { toast } from "sonner";
import { ConfirmProvider } from "@/components/ConfirmProvider";
import { WorkoutsTab } from "../protocol-builder/WorkoutsTab";
import { ProtocolPayloadSchema, PeriodizationSchema } from "@/lib/protocolSchema";

const ex = (id: string, name: string) => ({ __id: id, name, sets: "4", reps: "10", cadence: "", rest: "", notes: "", is_mobility: false });

function payloadWith(cardio: Array<Record<string, unknown>> = []) {
  return ProtocolPayloadSchema.parse({
    setup: { split: "AB", mealsCount: 4, carbCycle: false },
    workouts: [
      { key: "A", focus: "Peito", exercises: [ex("a1", "Supino")] },
      { key: "B", focus: "Costas", exercises: [ex("b1", "Remada")] },
    ],
    weekDays: { seg: "A", ter: "B" },
    periodization: PeriodizationSchema.parse({ enabled: true }),
    cardio,
  });
}

const setup = (payload = payloadWith()) => {
  const setPayload = vi.fn();
  render(
    <ConfirmProvider>
      <WorkoutsTab payload={payload} setPayload={setPayload} coachId="c1" />
    </ConfirmProvider>,
  );
  return setPayload;
};

describe("WorkoutsTab — duplicar treino e limpeza de redundâncias", () => {
  beforeEach(() => vi.clearAllMocks());

  it("duplicar o Treino A (menu ⋯) devolve um payload com 3 treinos e avisa o coach", async () => {
    const setPayload = setup();
    await userEvent.click(screen.getByTestId("workout-menu-A"));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Duplicar treino/ }));
    expect(setPayload).toHaveBeenCalledTimes(1);
    const next = setPayload.mock.calls[0][0];
    expect(next.workouts.map((w: { key: string }) => w.key)).toEqual(["A", "B", "C"]);
    expect(next.workouts[2].exercises[0].name).toBe("Supino");
    expect(next.workouts[2].exercises[0].__id).not.toBe("a1");
    expect(toast.success).toHaveBeenCalled();
  });

  it("o aviso de periodização aparece UMA vez e explica a regra da semana", () => {
    setup();
    expect(screen.getAllByTestId("periodization-rule-note")).toHaveLength(1);
    expect(screen.getByTestId("periodization-rule-note").textContent).toMatch(/seguem a semana/);
  });

  it("aeróbicos num lugar só, com vínculo a treino ou a qualquer dia (inclusive descanso)", () => {
    const p = payloadWith([
      { type: "LISS", duration: "30", intensity: "Leve", workoutKey: "A", associationType: "workout", notes: "" },
      { type: "AEJ", duration: "40", intensity: "Leve", workoutKey: "qua", associationType: "weekday", notes: "" },
    ]);
    p.weekDays = { ...p.weekDays, qua: "REST" };
    setup(p);
    expect(screen.queryByText(/Aeróbico neste treino/)).toBeNull();
    expect(screen.queryByText(/Aeróbicos gerais/)).toBeNull();
    const section = screen.getByTestId("cardio-section");
    expect(within(section).getAllByPlaceholderText("Observações")).toHaveLength(2);
    expect(within(section).getByTestId("cardio-link-0").textContent).toMatch(/Treino A/);
    expect(within(section).getByTestId("cardio-link-1").textContent).toMatch(/Quarta \(descanso\)/);
  });

  it("sem aeróbicos, mostra a dica curta", () => {
    setup();
    expect(screen.getByText(/Nenhum aeróbico. Pode vincular/)).toBeInTheDocument();
  });

  it("dias da semana só na faixa: tocar no dia escolhe o treino; os treinos mostram os dias só para leitura", async () => {
    const setPayload = setup();
    expect(screen.queryByTitle("Dias da semana deste treino")).toBeNull();
    expect(screen.getByTestId("workout-days-A").textContent).toMatch(/Seg/);
    await userEvent.click(screen.getByTestId("day-qua"));
    await userEvent.click(await screen.findByTestId("day-qua-opt-B"));
    expect(setPayload.mock.calls.at(-1)![0].weekDays).toMatchObject({ seg: "A", ter: "B", qua: "B" });
    await userEvent.click(screen.getByTestId("day-dom"));
    await userEvent.click(await screen.findByTestId("day-dom-opt-REST"));
    expect(setPayload.mock.calls.at(-1)![0].weekDays.dom).toBe("REST");
  });

  it("ações do exercício num menu ⋯: excluir", async () => {
    const setPayload = setup();
    const card = screen.getByTestId("workout-card-A");
    const menus = within(card).getAllByTestId("exercise-menu");
    await userEvent.click(menus[menus.length - 1]);
    await userEvent.click(await screen.findByTestId("exercise-delete"));
    expect(setPayload.mock.calls.at(-1)![0].workouts[0].exercises).toHaveLength(0);
  });
});

describe("WorkoutsTab — periodização ligada: a semana manda, exceção marcada", () => {
  it("campos vazios mostram a Semana 1 em cinza; digitar grava exceção nas 4 semanas", async () => {
    const p = payloadWith();
    p.workouts[0].exercises[0] = { ...p.workouts[0].exercises[0], sets: "", reps: "" };
    const setPayload = setup(p);
    const card = screen.getByTestId("workout-card-A");
    const reps = within(card).getAllByTestId("rx-reps")[0] as HTMLInputElement;
    expect(reps.value).toBe("");
    expect(reps.placeholder).toBe("S1 5–8"); // "5 a 8 reps" compactado para caber no campo
    expect(reps.dataset.exception).toBeUndefined();
    await userEvent.type(reps, "6");
    const next = setPayload.mock.calls.at(-1)![0];
    for (const w of ["0", "1", "2", "3"]) {
      expect(Object.values(next.periodization.overrides[w])).toContainEqual(expect.objectContaining({ exerciseId: "a1", reps: "6" }));
    }
    expect(next.workouts[0].exercises[0].reps).toBe("");
  });

  it("exceção existente aparece com marca; sem periodização o campo é o do exercício", () => {
    const p = payloadWith();
    p.periodization.overrides = Object.fromEntries(["0", "1", "2", "3"].map((w) => [w, { A_0: { exerciseId: "a1", sets: "2" } }]));
    setup(p);
    const sets = within(screen.getByTestId("workout-card-A")).getAllByTestId("rx-sets")[0] as HTMLInputElement;
    expect(sets.value).toBe("2");
    expect(sets.dataset.exception).toBe("true");
  });

  it("sem periodização: mostra e grava o valor do próprio exercício; tem Replicar configuração", async () => {
    const p = payloadWith();
    p.periodization.enabled = false;
    p.workouts[0].exercises.push({ ...p.workouts[0].exercises[0], __id: "a2", name: "Crucifixo" });
    const setPayload = setup(p);
    const sets = within(screen.getByTestId("workout-card-A")).getAllByTestId("rx-sets")[0] as HTMLInputElement;
    expect(sets.value).toBe("4");
    expect(screen.queryByTestId("periodization-rule-note")).toBeNull();
    expect(screen.getByText(/Replicar configuração/)).toBeTruthy();
    await userEvent.type(sets, "5");
    expect(setPayload.mock.calls.at(-1)![0].workouts[0].exercises[0].sets).toBe("45");
  });
});

describe("WorkoutsTab — inverter a ordem e modo Semana Corrida", () => {
  it("inverter fica no menu ⋯ do treino e o cabeçalho mostra só um selo", async () => {
    const p = payloadWith();
    p.workouts[1] = { ...p.workouts[1], invert: { mode: "consecutive", since: "2026-12-01" } };
    const setPayload = setup(p);
    expect(within(screen.getByTestId("workout-card-B")).getByTestId("invert-badge")).toBeTruthy();
    expect(within(screen.getByTestId("workout-card-A")).queryByTestId("invert-badge")).toBeNull();
    expect(screen.queryByTestId("invert-all")).toBeNull();
    await userEvent.click(screen.getByTestId("workout-menu-A"));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Inverter a ordem/ }));
    await userEvent.click(await screen.findByTestId("invert-A-weekly"));
    expect(setPayload.mock.calls.at(-1)![0].workouts[0].invert.mode).toBe("weekly");
  });

  it("modo Semana Corrida: mesma faixa da semana e descanso; sem aeróbicos", () => {
    render(
      <ConfirmProvider>
        <WorkoutsTab payload={payloadWith()} setPayload={vi.fn()} coachId="c1" variant="busyWeek" />
      </ConfirmProvider>,
    );
    expect(screen.getByTestId("week-strip")).toBeTruthy();
    expect(screen.getByText(/Nenhum dia de descanso marcado|escolha os dias na faixa/)).toBeTruthy();
    expect(screen.queryByTestId("cardio-section")).toBeNull();
    expect(screen.getByTestId("workout-menu-A")).toBeTruthy();
  });
});
