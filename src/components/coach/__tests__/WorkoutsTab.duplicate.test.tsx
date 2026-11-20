import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/coach/ExercisePickerInput", () => ({ ExercisePickerInput: ({ value }: { value: string }) => <span>{value}</span> }));
vi.mock("@/components/coach/ExerciseSubstitutesPopover", () => ({ ExerciseSubstitutesPopover: () => null }));
vi.mock("@/components/coach/CoachExerciseLibraryDialog", () => ({ CoachExerciseLibraryDialog: () => null }));
vi.mock("@/components/coach/MobilityTemplateBar", () => ({ MobilityTemplateBar: () => null }));
vi.mock("@/components/coach/WorkoutTemplateQuickPicker", () => ({ WorkoutTemplateQuickPicker: () => null }));
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

  it("duplicar o Treino A devolve um payload com 3 treinos e avisa o coach", async () => {
    const setPayload = setup();
    const buttons = screen.getAllByTitle(/Duplicar este treino/);
    expect(buttons).toHaveLength(2);
    await userEvent.click(buttons[0]);
    expect(setPayload).toHaveBeenCalledTimes(1);
    const next = setPayload.mock.calls[0][0];
    expect(next.workouts.map((w: { key: string }) => w.key)).toEqual(["A", "B", "C"]);
    expect(next.workouts[2].exercises[0].name).toBe("Supino");
    expect(next.workouts[2].exercises[0].__id).not.toBe("a1");
    expect(toast.success).toHaveBeenCalled();
  });

  it("o aviso de periodização aparece UMA vez, não em cada treino", () => {
    setup();
    expect(screen.getAllByText(/Periodização ativa: os campos de séries/)).toHaveLength(1);
  });

  it("aeróbico vinculado a um treino não se repete na lista geral", () => {
    setup(payloadWith([
      { type: "LISS", duration: "30 min", intensity: "Leve", workoutKey: "A", associationType: "workout", notes: "" },
      { type: "Caminhada", duration: "40 min", intensity: "Leve", workoutKey: "", associationType: "workout", notes: "geral" },
      { type: "HIIT", duration: "10 min", intensity: "Alta", workoutKey: "Z", associationType: "workout", notes: "treino removido" },
    ]));
    // vinculado ao A: aparece só dentro do card do treino
    expect(screen.getAllByText("Aeróbico do Treino A")).toHaveLength(1);
    // geral (sem treino) + órfão (treino Z não existe mais) ficam na lista geral, para revisar/excluir
    const general = screen.getByText("Aeróbicos gerais").closest("div")!.parentElement!;
    expect(within(general).getAllByPlaceholderText("Observações")).toHaveLength(2);
  });

  it("sem aeróbicos gerais, mostra a dica curta em vez da lista vazia", () => {
    setup();
    expect(screen.getByText(/Nenhum aeróbico geral/)).toBeInTheDocument();
  });
});

describe("WorkoutsTab — inverter a ordem e modo Semana Corrida", () => {
  it("cada treino tem o seletor de inversão, mostrando a regra salva", () => {
    const p = payloadWith();
    p.workouts[1] = { ...p.workouts[1], invert: { mode: "consecutive", since: "2026-12-01" } };
    setup(p);
    expect(screen.getByTestId("invert-select-A").textContent).toMatch(/Ordem normal/);
    expect(screen.getByTestId("invert-select-B").textContent).toMatch(/dias seguidos/i);
    expect(screen.getByTestId("invert-all")).toBeTruthy();
  });

  it("modo Semana Corrida esconde dias da semana, descanso e aeróbicos", () => {
    render(
      <ConfirmProvider>
        <WorkoutsTab payload={payloadWith()} setPayload={vi.fn()} coachId="c1" variant="busyWeek" />
      </ConfirmProvider>,
    );
    expect(screen.queryByTitle("Dias da semana deste treino")).toBeNull();
    expect(screen.queryByText(/Dia sem treino — vincule/)).toBeNull();
    expect(screen.queryByText(/Aeróbicos gerais/)).toBeNull();
    expect(screen.queryByText(/Aeróbico neste treino/)).toBeNull();
    expect(screen.getByTestId("invert-select-A")).toBeTruthy();
  });
});
