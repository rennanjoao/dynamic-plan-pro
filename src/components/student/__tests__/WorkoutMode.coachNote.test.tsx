/**
 * Recado opcional para o coach no fim do treino (pacote 5): o texto vai para
 * workout_sessions.notes e aparece na ficha do aluno para o coach.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WorkoutMode from "../WorkoutMode";

const h = vi.hoisted(() => ({
  registerSet: vi.fn(async (..._a: unknown[]) => {}),
  removeSet: vi.fn(async (..._a: unknown[]) => {}),
  resumeSession: vi.fn(),
  startSession: vi.fn(async () => {}),
  findActiveSession: vi.fn(async () => null),
  materializeLocalSession: vi.fn(async (..._a: unknown[]) => null as string | null),
  hasLocalSession: vi.fn((..._a: unknown[]) => false),
  best: vi.fn(async (..._a: unknown[]) => ({}) as Record<string, number>),
  success: vi.fn(),
  sessionId: "S1" as string | null,
  finishSession: vi.fn(async (..._a: unknown[]) => {}),
}));

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: (...a: unknown[]) => h.success(...a), error: vi.fn() }) }));
vi.mock("@/hooks/useWorkoutSession", () => ({
  isSessionStale: () => false,
  useWorkoutSession: () => ({
    sessionId: h.sessionId,
    startSession: h.startSession,
    resumeSession: h.resumeSession,
    findActiveSession: h.findActiveSession,
    abandonSession: vi.fn(),
    materializeLocalSession: h.materializeLocalSession,
    hasLocalSession: h.hasLocalSession,
    getSessionSets: async () => [],
    getExerciseLoadHistory: async () => ({}),
    getExerciseBestWeights: h.best,
    registerSet: h.registerSet,
    removeSet: h.removeSet,
    finishSession: h.finishSession,
    getStreak: async () => 0,
  }),
}));
vi.mock("@/hooks/useExerciseGif", () => ({ useExerciseGif: () => null }));
vi.mock("@/hooks/useAdaptiveWeightStep", () => ({ useAdaptiveWeightStep: () => ({ onPointerDown: () => () => {}, onPointerUp: () => {}, onPointerLeave: () => {} }) }));
vi.mock("@/components/ConfirmProvider", () => ({ useConfirm: () => async () => false }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [] }) }) }) }) }) } }));
vi.mock("@/lib/exerciseLibrary", () => ({ getLibraryEntry: async () => null, listExercisesByMuscleGroup: async () => [] }));
vi.mock("../WorkoutShareCard", () => ({ default: () => null }));

const workout = [{ key: "A", exercises: [{ name: "Supino", sets: "4", reps: "8", rest: "60s" }] }];

function show() {
  return render(<WorkoutMode workouts={workout} userId="u1" initialWeek={0} periodization={{ enabled: false }} onClose={() => {}} />);
}

// Faz uma série: digita a carga e toca em "Limpo".
async function lift(kg: number) {
  const user = userEvent.setup();
  const weight = (await screen.findAllByRole("textbox"))[0];
  fireEvent.change(weight, { target: { value: String(kg) } });
  await user.click(await screen.findByRole("button", { name: /Limpo/ }));
  await waitFor(() => expect(h.registerSet).toHaveBeenCalled());
}

describe("Modo Treino — recado para o coach", () => {
  beforeEach(() => {
    cleanup(); localStorage.clear();
    h.finishSession.mockClear(); h.registerSet.mockClear();
    h.sessionId = "S1"; h.best.mockResolvedValue({}); h.hasLocalSession.mockReturnValue(false); h.materializeLocalSession.mockResolvedValue(null);
  });

  it("o recado digitado ao finalizar é enviado junto com a sessão", async () => {
    show();
    await lift(20);
    await userEvent.click(await screen.findByRole("button", { name: /Finalizar/ }));
    const note = await screen.findByTestId("post-workout-note");
    expect(screen.getByText("Quer avisar algo ao coach?")).toBeTruthy();
    await userEvent.type(note, "  Senti o joelho no agachamento  ");
    await userEvent.click(screen.getByRole("button", { name: /Confirmar e Finalizar/ }));
    await waitFor(() => expect(h.finishSession).toHaveBeenCalled());
    expect(h.finishSession.mock.calls[0][0]).toMatchObject({ notes: "Senti o joelho no agachamento" });
  });

  it("sem recado, nada é enviado no campo (continua opcional)", async () => {
    show();
    await lift(20);
    await userEvent.click(await screen.findByRole("button", { name: /Finalizar/ }));
    await userEvent.click(await screen.findByRole("button", { name: /Confirmar e Finalizar/ }));
    await waitFor(() => expect(h.finishSession).toHaveBeenCalled());
    expect((h.finishSession.mock.calls[0][0] as { notes?: string }).notes).toBeUndefined();
  });
});
