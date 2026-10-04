import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WorkoutMode from "../WorkoutMode";

const batch = vi.fn();
let loads: Record<string, { sessionId: string; executedAt: string; periodizationWeek: number | null; sets: { setNumber: number; weightKg: number; reps: number }[] }[]> = {};

vi.mock("@/hooks/useWorkoutSession", () => ({
  isSessionStale: () => false,
  useWorkoutSession: () => ({
    sessionId: "active-session",
    startSession: vi.fn(),
    findActiveSession: async () => null,
    getExerciseLoadHistory: (opts: unknown) => batch(opts),
    getExerciseBestWeights: async () => ({}),
    materializeLocalSession: async () => null,
    hasLocalSession: () => false,
    registerSet: vi.fn(),
    removeSet: vi.fn(),
    getStreak: async () => 0,
  }),
}));
vi.mock("@/hooks/useExerciseGif", () => ({ useExerciseGif: () => null }));
vi.mock("@/hooks/useAdaptiveWeightStep", () => ({ useAdaptiveWeightStep: () => ({ onPointerDown: () => () => {}, onPointerUp: () => {}, onPointerLeave: () => {} }) }));
vi.mock("@/components/ConfirmProvider", () => ({ useConfirm: () => async () => false }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [] }) }) }) }) }) } }));
vi.mock("@/lib/exerciseLibrary", () => ({ getLibraryEntry: async () => null, listExercisesByMuscleGroup: async () => [{ key: "remada", displayName: "Remada", url: "" }] }));
vi.mock("../WorkoutShareCard", () => ({ default: () => null }));

const workout = [{ key: "A", exercises: [{ name: "Supino", sets: "3", reps: "8", rest: "60s" }] }];
const periodization = { enabled: true, weeks: [
  { label: "Peso", reps: "5 a 8 reps", sets: "3", rest: "60s" },
  { label: "Técnica", reps: "10 a 12 reps", sets: "3", rest: "60s" },
  { label: "Técnica", reps: "10 a 12 reps", sets: "3", rest: "60s" },
  { label: "Resistência", reps: "15 a 20 reps", sets: "3", rest: "60s" },
] };

function show(initialWeek = 0, enabled = true) {
  return render(<WorkoutMode workouts={workout} userId="student-1" initialWeek={initialWeek} periodization={{ ...periodization, enabled }} onClose={() => {}} />);
}

describe("referência compacta da última carga", () => {
  beforeEach(() => {
    cleanup(); localStorage.clear(); batch.mockReset(); loads = {};
    batch.mockImplementation(async () => loads);
  });

  it("mostra carga da fase Peso", async () => {
    loads = { Supino: [{ sessionId: "old", executedAt: "2026-10-02", periodizationWeek: 0, sets: [{ setNumber: 1, weightKg: 30, reps: 8 }, { setNumber: 2, weightKg: 35, reps: 8 }] }] };
    show();
    await waitFor(() => expect(batch).toHaveBeenCalledWith(expect.objectContaining({ userId: "student-1", exerciseNames: ["Supino"], weekSlot: 0, excludeSessionId: "active-session" })));
    expect(await screen.findByTestId("last-load-ref")).toHaveTextContent("Último treino (Sem. 1): 30kg×8 · 35kg×8");
  });

  it("não reutiliza Peso na Resistência sem registros", async () => {
    show(3);
    await waitFor(() => expect(batch).toHaveBeenCalledWith(expect.objectContaining({ weekSlot: 3 })));
    expect(screen.queryByTestId("last-load-ref")).toBeNull();
  });

  it("sem periodização lê o geral, sem fase na referência", async () => {
    loads = { Supino: [{ sessionId: "old", executedAt: "2026-10-02", periodizationWeek: null, sets: [{ setNumber: 1, weightKg: 40, reps: 10 }] }] };
    show(0, false);
    await waitFor(() => expect(batch).toHaveBeenCalledWith(expect.objectContaining({ weekSlot: null })));
    expect(await screen.findByTestId("last-load-ref")).toHaveTextContent("Último treino: 40kg×10");
  });

  it("sem fase nem registro não acrescenta texto", async () => {
    show(0, false);
    await waitFor(() => expect(batch).toHaveBeenCalledWith(expect.objectContaining({ weekSlot: null })));
    expect(screen.queryByTestId("last-load-ref")).toBeNull();
  });

  it("trocar exercício rebusca os nomes e mostra somente a carga do novo exercício", async () => {
    loads = { Supino: [{ sessionId: "old", executedAt: "2026-10-02", periodizationWeek: 0, sets: [{ setNumber: 1, weightKg: 30, reps: 8 }] }] };
    show();
    await screen.findByText("Último treino (Sem. 1): 30kg×8");
    await userEvent.click(screen.getByRole("button", { name: /Trocar exercício/i }));
    await userEvent.click(await screen.findByRole("button", { name: "Remada" }));
    await waitFor(() => expect(batch).toHaveBeenCalledWith(expect.objectContaining({ exerciseNames: ["Remada"], weekSlot: 0 })));
    await waitFor(() => expect(screen.queryByTestId("last-load-ref")).toBeNull());
  });
});