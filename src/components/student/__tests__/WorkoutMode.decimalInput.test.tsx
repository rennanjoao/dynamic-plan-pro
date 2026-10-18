/**
 * Campo de carga do Modo Treino: aceita vírgula ou ponto.
 * Antes, digitar "7,5" gravava 75 kg (a vírgula era apagada), "2,5" gravava 25 kg e "12,5" gravava 125 kg.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WorkoutMode from "../WorkoutMode";

const h = vi.hoisted(() => ({
  registerSet: vi.fn(async (..._a: unknown[]) => {}),
  history: {} as Record<string, unknown>,
}));

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/hooks/useWorkoutSession", () => ({
  isSessionStale: () => false,
  useWorkoutSession: () => ({
    sessionId: "S1",
    startSession: vi.fn(),
    resumeSession: vi.fn(),
    findActiveSession: async () => null,
    abandonSession: vi.fn(),
    materializeLocalSession: async () => null,
    hasLocalSession: () => false,
    getSessionSets: async () => [],
    getExerciseLoadHistory: async () => h.history,
    getExerciseBestWeights: async () => ({}),
    registerSet: h.registerSet,
    removeSet: vi.fn(),
    finishSession: vi.fn(),
    getStreak: async () => 0,
  }),
}));
vi.mock("@/hooks/useExerciseGif", () => ({ useExerciseGif: () => null }));
vi.mock("@/hooks/useAdaptiveWeightStep", () => ({ useAdaptiveWeightStep: () => ({ onPointerDown: () => () => {}, onPointerUp: () => {}, onPointerLeave: () => {} }) }));
vi.mock("@/components/ConfirmProvider", () => ({ useConfirm: () => async () => false }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [] }) }) }) }) }) } }));
vi.mock("@/lib/exerciseLibrary", () => ({ getLibraryEntry: async () => null, listExercisesByMuscleGroup: async () => [] }));
vi.mock("../WorkoutShareCard", () => ({ default: () => null }));

const workout = [{ key: "A", exercises: [{ name: "Supino", sets: "3", reps: "8 a 12 reps", rest: "60s" }] }];
const show = () => render(<WorkoutMode workouts={workout} userId="u1" onClose={() => {}} />);
const inputs = async () => (await screen.findAllByRole("textbox")) as HTMLInputElement[];

describe("Modo Treino — carga com vírgula ou ponto", () => {
  beforeEach(() => { cleanup(); localStorage.clear(); h.registerSet.mockClear(); h.history = {}; });

  it.each([
    ["7,5", 7.5], ["7.5", 7.5], ["2,5", 2.5], ["0,5", 0.5], ["12,5", 12.5], ["20", 20],
  ])('digitar "%s" grava %s kg (e não 10x mais)', async (typed, expected) => {
    const user = userEvent.setup();
    show();
    const [weight, reps] = await inputs();
    await user.type(weight, typed);
    fireEvent.change(reps, { target: { value: "10" } });
    await user.click(await screen.findByRole("button", { name: /Limpo/ }));
    await waitFor(() => expect(h.registerSet).toHaveBeenCalled());
    expect(h.registerSet.mock.calls[0][0]).toMatchObject({ weightKg: expected, reps: 10 });
  });

  it("mostra com vírgula o que a aluna digita, inclusive com a vírgula ainda sem decimal", async () => {
    const user = userEvent.setup();
    show();
    const [weight] = await inputs();
    await user.type(weight, "7,");
    expect(weight.value).toBe("7,");
    await user.type(weight, "5");
    expect(weight.value).toBe("7,5");
  });

  it("apagar tudo deixa o campo vazio (carga 0, peso corporal)", async () => {
    const user = userEvent.setup();
    show();
    const [weight] = await inputs();
    await user.type(weight, "12");
    await user.clear(weight);
    expect(weight.value).toBe("");
  });

  it("a carga que vem do último treino aparece no campo, com vírgula", async () => {
    h.history = { Supino: [{ sessionId: "old", executedAt: "2026-10-01T10:00:00Z", periodizationWeek: null, sets: [{ setNumber: 1, weightKg: 7.5, reps: 10 }] }] };
    show();
    await screen.findByTestId("last-load-ref");
    await waitFor(async () => expect((await inputs())[0].value).toBe("7,5"));
  });
});
