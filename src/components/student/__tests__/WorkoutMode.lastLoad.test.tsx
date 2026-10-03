import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WorkoutMode from "../WorkoutMode";

const batch = vi.fn();
let loads: Record<string, { weightKg: number; reps: number; executedAt: string }[]> = {};

vi.mock("@/hooks/useWorkoutSession", () => ({
  isSessionStale: () => false,
  useWorkoutSession: () => ({
    sessionId: null,
    startSession: vi.fn(),
    findActiveSession: async () => null,
    getExerciseHistoryBatch: (...args: [string[], string | null]) => batch(...args),
    getStreak: async () => 0,
  }),
}));
vi.mock("@/hooks/useExerciseGif", () => ({ useExerciseGif: () => null }));
vi.mock("@/hooks/useAdaptiveWeightStep", () => ({ useAdaptiveWeightStep: () => ({ onPointerDown: () => () => {}, onPointerUp: () => {}, onPointerLeave: () => {} }) }));
vi.mock("@/components/ConfirmProvider", () => ({ useConfirm: () => async () => false }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [] }) }) }) }) }) } }));
vi.mock("@/lib/exerciseLibrary", () => ({ getLibraryEntry: async () => null, listExercisesByMuscleGroup: async () => [] }));
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
    loads = { Supino: [{ weightKg: 30, reps: 8, executedAt: "2026-10-02" }] };
    show();
    await waitFor(() => expect(batch).toHaveBeenCalledWith(["Supino"], "peso"));
    expect(await screen.findByTestId("last-load-ref")).toHaveTextContent("Últ. Peso: 30kg × 8");
  });

  it("não reutiliza Peso na Resistência sem registros", async () => {
    show(3);
    await waitFor(() => expect(batch).toHaveBeenCalledWith(["Supino"], "resistencia"));
    expect(await screen.findByTestId("last-load-ref")).toHaveTextContent("Sem carga anterior nesta fase");
  });

  it("sem periodização lê o geral, sem fase na referência", async () => {
    loads = { Supino: [{ weightKg: 40, reps: 10, executedAt: "2026-10-02" }] };
    show(0, false);
    await waitFor(() => expect(batch).toHaveBeenCalledWith(["Supino"], null));
    expect(await screen.findByTestId("last-load-ref")).toHaveTextContent("Últ.: 40kg × 10");
  });

  it("sem fase nem registro não acrescenta texto", async () => {
    show(0, false);
    await waitFor(() => expect(batch).toHaveBeenCalledWith(["Supino"], null));
    expect(screen.queryByTestId("last-load-ref")).toBeNull();
  });
});