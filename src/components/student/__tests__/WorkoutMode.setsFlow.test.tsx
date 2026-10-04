/**
 * Modo Treino — fluxo das séries (regressão da auditoria):
 * recorde só com histórico, horário real da série, remoção da série do meio
 * renumerando no servidor e retomada de treino iniciado sem rede.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WorkoutMode from "../WorkoutMode";
import { workoutStateStorageKey } from "@/lib/periodizationKey";

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
const recordToasts = () => h.success.mock.calls.map(c => String(c[0])).filter(t => t.includes("RECORD"));
const lastRegistered = () => h.registerSet.mock.calls.at(-1)?.[0] as Record<string, any>;

describe("Modo Treino — séries", () => {
  beforeEach(() => {
    cleanup(); localStorage.clear();
    Object.values(h).forEach(v => { if (typeof v === "function" && "mockClear" in v) (v as any).mockClear(); });
    h.sessionId = "S1"; h.best.mockResolvedValue({}); h.hasLocalSession.mockReturnValue(false); h.materializeLocalSession.mockResolvedValue(null);
  });

  describe("recorde", () => {
    it("primeiro treino do exercício (sem histórico) NÃO comemora recorde", async () => {
      show();
      await waitFor(() => expect(h.best).toHaveBeenCalledWith({ userId: "u1", exerciseNames: ["Supino"] }));
      await lift(20);
      expect(recordToasts()).toEqual([]);
    });

    it("supera o melhor de sempre do exercício → recorde", async () => {
      h.best.mockResolvedValue({ Supino: 20 });
      show();
      await waitFor(() => expect(h.best).toHaveBeenCalled());
      await act(async () => { await Promise.resolve(); });
      await lift(25);
      expect(recordToasts()).toEqual(["🏆 NOVO RECORD! 25kg em Supino"]);
    });

    it("carga menor que o melhor de sempre (mesmo sendo maior que a da semana) NÃO é recorde", async () => {
      h.best.mockResolvedValue({ Supino: 40 });
      show();
      await waitFor(() => expect(h.best).toHaveBeenCalled());
      await act(async () => { await Promise.resolve(); });
      await lift(25);
      expect(recordToasts()).toEqual([]);
    });
  });

  it("cada série vai com o horário real em que foi feita", async () => {
    show();
    const before = Date.now();
    await lift(30);
    const at = Date.parse(lastRegistered().executedAt);
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(Date.now());
    expect(lastRegistered()).toMatchObject({ exerciseName: "Supino", setNumber: 1, weightKg: 30 });
  });

  it("remover a série 2 de 3: manda ao servidor a renumeração e a próxima série vira a 3 sem sobrescrever", async () => {
    const user = userEvent.setup();
    show();
    for (const kg of [30, 32, 34]) await lift(kg);
    h.registerSet.mockClear();

    await user.click(screen.getByRole("button", { name: "Editar série 2" }));
    await user.click(await screen.findByRole("button", { name: "Remover" }));

    await waitFor(() => expect(h.removeSet).toHaveBeenCalledTimes(1));
    const [name, plan] = h.removeSet.mock.calls[0] as [string, any];
    expect(name).toBe("Supino");
    expect(plan).toMatchObject({ fromSetNumber: 2, keepCount: 2 });
    expect(plan.shifted).toHaveLength(1);
    expect(plan.shifted[0]).toMatchObject({ setNumber: 2, weightKg: 34, completed: true });
    expect(plan.shifted[0].executedAt).toBeTruthy(); // preserva o horário da série que desceu

    // as bolinhas refletem 2 séries feitas; a próxima é a 3
    await lift(36);
    expect(lastRegistered()).toMatchObject({ setNumber: 3, weightKg: 36 });
  });

  it("remover a ÚLTIMA série só trunca (nada é reescrito)", async () => {
    const user = userEvent.setup();
    show();
    for (const kg of [30, 32]) await lift(kg);
    await user.click(screen.getByRole("button", { name: "Editar série 2" }));
    await user.click(await screen.findByRole("button", { name: "Remover" }));
    await waitFor(() => expect(h.removeSet).toHaveBeenCalled());
    const [, plan] = h.removeSet.mock.calls[0] as [string, any];
    expect(plan).toMatchObject({ fromSetNumber: 2, keepCount: 1, shifted: [] });
  });

  describe("treino iniciado sem rede (id local) ao reabrir", () => {
    const seed = (sessionId: string) => localStorage.setItem(
      workoutStateStorageKey("u1", "A", null, null),
      JSON.stringify({ activeWeek: 0, sessionId, startedAt: Date.now() - 60_000, setDataMap: {}, swapMap: {} }),
    );

    it("com rede: cria a sessão real e retoma NELA (não abre outra)", async () => {
      seed("local_123");
      h.sessionId = null;
      h.materializeLocalSession.mockResolvedValue("S9");
      show();
      await waitFor(() => expect(h.resumeSession).toHaveBeenCalled());
      expect(h.resumeSession.mock.calls[0][0]).toMatchObject({ sessionId: "S9", userId: "u1", workoutKey: "A" });
      expect(h.startSession).not.toHaveBeenCalled();
    });

    it("ainda sem rede: continua na MESMA sessão local", async () => {
      seed("local_123");
      h.sessionId = null;
      h.hasLocalSession.mockReturnValue(true);
      show();
      await waitFor(() => expect(h.resumeSession).toHaveBeenCalled());
      expect(h.resumeSession.mock.calls[0][0]).toMatchObject({ sessionId: "local_123" });
      expect(h.startSession).not.toHaveBeenCalled();
    });

    it("id local antigo, sem registro (versão anterior): segue o fluxo de sempre", async () => {
      seed("local_123");
      h.sessionId = null;
      show();
      await waitFor(() => expect(h.startSession).toHaveBeenCalled());
      expect(h.resumeSession).not.toHaveBeenCalled();
    });
  });
});
