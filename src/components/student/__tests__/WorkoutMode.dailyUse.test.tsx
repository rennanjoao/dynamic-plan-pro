/**
 * Modo Treino — uso diário (auditoria 18/11): cronômetro compacto fora do
 * descanso, pausar/continuar, rótulos simples, sem aviso redundante por série,
 * edição de série aceitando vírgula e som liberado no toque (iPhone).
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

const audio = vi.hoisted(() => ({ created: 0, started: 0 }));
class FakeAudioContext {
  state = "running";
  currentTime = 0;
  destination = {};
  constructor() { audio.created++; }
  resume() { return Promise.resolve(); }
  createBuffer() { return {}; }
  createBufferSource() { return { buffer: null, connect: () => {}, start: () => { audio.started++; } }; }
  createOscillator() { return { connect: () => {}, frequency: { setValueAtTime: () => {} }, start: () => {}, stop: () => {} }; }
  createGain() { return { connect: () => {}, gain: { setValueAtTime: () => {}, linearRampToValueAtTime: () => {} } }; }
}

describe("Modo Treino — uso diário", () => {
  beforeEach(() => {
    cleanup(); localStorage.clear();
    Object.values(h).forEach(v => { if (typeof v === "function" && "mockClear" in v) (v as { mockClear: () => void }).mockClear(); });
    h.sessionId = "S1"; h.best.mockResolvedValue({}); h.hasLocalSession.mockReturnValue(false); h.materializeLocalSession.mockResolvedValue(null);
    (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
  });

  it("botões de esforço explicam o que significam", async () => {
    show();
    for (const t of ["Sobrou força", "No limite", "Não completei"]) expect(await screen.findByText(t)).toBeTruthy();
  });

  it("antes da série o cronômetro é uma faixa fina; durante o descanso fica grande", async () => {
    show();
    expect(await screen.findByTestId("rest-timer-compact")).toBeTruthy();
    expect(screen.getByText("Hora da série")).toBeTruthy();
    expect(screen.queryByTestId("rest-timer-full")).toBeNull();
    await lift(20);
    expect(await screen.findByTestId("rest-timer-full")).toBeTruthy();
    expect(screen.getByText("Descansando")).toBeTruthy();
    expect(screen.queryByText(/Aguardando Série|Recuperando|Janela Aberta/)).toBeNull();
  });

  it("pausar mantém o tempo e 'Continuar' retoma", { timeout: 10000 }, async () => {
    show();
    await lift(20);
    await act(async () => { await new Promise((r) => setTimeout(r, 2100)); }); // descansa ~2s
    await userEvent.click(await screen.findByRole("button", { name: "Pausar" }));
    expect(await screen.findByText(/Descanso pausado/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByTestId("rest-timer-full")).toBeTruthy();
  });

  it("não mostra mais o aviso 'Série registrada' a cada série", async () => {
    show();
    await lift(20);
    expect(h.success.mock.calls.map(c => String(c[0])).some(t => /registrada/i.test(t))).toBe(false);
  });

  it("libera o som no toque de registrar (iPhone)", async () => {
    show();
    const before = audio.started;
    await lift(20);
    expect(audio.started).toBeGreaterThan(before);
  });

  it("editar uma série aceita vírgula (7,5 kg)", async () => {
    show();
    await lift(20);
    await userEvent.click(await screen.findByRole("button", { name: "Editar série 1" }));
    const dialogWeight = (await screen.findAllByRole("textbox")).at(-2) as HTMLInputElement;
    fireEvent.change(dialogWeight, { target: { value: "7,5" } });
    expect(dialogWeight.value).toBe("7,5");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect((h.registerSet.mock.calls.at(-1)?.[0] as { weightKg?: number })?.weightKg).toBe(7.5));
  });
});
