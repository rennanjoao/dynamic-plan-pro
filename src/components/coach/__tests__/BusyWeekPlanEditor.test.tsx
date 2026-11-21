import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/coach/ExercisePickerInput", () => ({ ExercisePickerInput: ({ value }: { value: string }) => <span>{value}</span> }));
vi.mock("@/components/coach/ExerciseSubstitutesPopover", () => ({ ExerciseSubstitutesPopover: () => null }));
vi.mock("@/components/coach/CoachExerciseLibraryDialog", () => ({ CoachExerciseLibraryDialog: () => null }));
vi.mock("@/components/coach/MobilityTemplateBar", () => ({ MobilityTemplateBar: () => null }));
vi.mock("@/components/coach/WorkoutTemplateQuickPicker", () => ({ WorkoutTemplateQuickPicker: () => null }));
vi.mock("@/components/coach/WorkoutPeriodizationEditor", () => ({ default: () => null }));
vi.mock("@/components/coach/PeriodizationTemplateQuickPicker", () => ({ PeriodizationTemplateQuickPicker: () => null }));

import { toast } from "sonner";
import { ConfirmProvider } from "@/components/ConfirmProvider";
import { BusyWeekPlanEditor } from "../busy-week/BusyWeekPlanEditor";
import { normalizeBusyPayload } from "@/lib/busyWeek";

const filled = normalizeBusyPayload({
  workouts: [
    { key: "A", focus: "Full Body A", exercises: [{ name: "Agachamento", __id: "e1" }] },
    { key: "B", focus: "Full Body B", exercises: [{ name: "Terra", __id: "e2" }] },
  ],
  dietRule: { training: "high", rest: "off" },
});

const show = (initial: Parameters<typeof BusyWeekPlanEditor>[0]["initial"], onSave = vi.fn()) => {
  render(
    <ConfirmProvider>
      <BusyWeekPlanEditor open onOpenChange={() => {}} coachId="c1" initial={initial} title="Plano" onSave={onSave} />
    </ConfirmProvider>,
  );
  return onSave;
};

describe("Editor do plano da Semana Corrida", () => {
  it("salva com chaves SC_ e a regra da dieta", async () => {
    const onSave = show({ name: "Full Body Dez", kind: "fullbody", payload: filled });
    await userEvent.click(screen.getByTestId("busy-plan-save"));
    expect(onSave).toHaveBeenCalledTimes(1);
    const draft = onSave.mock.calls[0][0];
    expect(draft.name).toBe("Full Body Dez");
    expect(draft.payload.workouts.map((w: { key: string }) => w.key)).toEqual(["SC_A", "SC_B"]);
    expect(draft.payload.dietRule).toEqual({ training: "high", rest: "off" });
  });

  it("não salva sem nome nem com treinos vazios", async () => {
    const onSave = show(null);
    await userEvent.click(screen.getByTestId("busy-plan-save"));
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/nome/));
    await userEvent.type(screen.getByLabelText("Nome do plano"), "Novo");
    await userEvent.click(screen.getByTestId("busy-plan-save"));
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/sem exercícios/));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("plano novo começa com 2 treinos e inversão em dias seguidos (selo no cabeçalho)", () => {
    show(null);
    expect(screen.getAllByTestId("invert-badge")).toHaveLength(2);
    expect(screen.getByTestId("workout-menu-A")).toBeTruthy();
    expect(screen.getByTestId("workout-menu-B")).toBeTruthy();
  });
});
