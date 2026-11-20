/**
 * Semana Corrida na tela de treino da aluna: seletor Rotina normal / Semana
 * corrida, treinos do plano secundário, próximo da rotação e ordem invertida
 * quando ela treinou no dia anterior.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const h = vi.hoisted(() => ({
  busy: undefined as unknown,
  mutate: vi.fn(),
}));

vi.mock("@/hooks/useAuthUserId", () => ({ useAuthUserId: () => "u1" }));
vi.mock("@/hooks/useWakeLock", () => ({ useWakeLock: () => {} }));
vi.mock("@/hooks/useHighlightTarget", () => ({ useHighlightTarget: () => {} }));
vi.mock("@/hooks/useWorkoutSession", () => ({ isSessionStale: () => false }));
vi.mock("@/hooks/useCurrentPeriodizationWeek", () => ({ useCurrentPeriodizationWeek: () => 0 }));
vi.mock("@/hooks/useBusyWeek", () => ({
  useStudentBusyWeek: () => ({ data: h.busy }),
  useSetMyBusyWeekMode: () => ({ mutate: h.mutate, isPending: false }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ["eq", "order", "limit", "not", "in", "select"]) chain[m] = () => chain;
      chain.maybeSingle = async () => table === "protocols"
        ? {
            data: {
              id: "p1",
              coach_id: "c1",
              student_first_viewed_at: null,
              payload: {
                workouts: [
                  { key: "A", focus: "Peito", exercises: [{ name: "Supino" }] },
                  { key: "B", focus: "Costas", exercises: [{ name: "Remada" }] },
                ],
                periodization: { enabled: false },
              },
            },
            error: null,
          }
        : { data: null, error: null };
      return chain;
    },
    channel: () => { const ch: Record<string, unknown> = {}; ch.on = () => ch; ch.subscribe = () => ch; return ch; },
    removeChannel: () => {},
  },
}));
vi.mock("@/components/shared/ExerciseNameButton", async () => {
  const React = await import("react");
  return { ExerciseNameButton: (p: { name: string }) => React.createElement("span", { "data-testid": "ex" }, p.name) };
});
vi.mock("@/components/student/ProtocolQuestionButton", () => ({ default: () => null }));
vi.mock("@/components/student/WorkoutMode", () => ({ default: () => null }));
vi.mock("@/components/student/WorkoutHistory", () => ({ default: () => null }));
vi.mock("@/components/student/MobilityExerciseRow", () => ({ MobilityExerciseRow: () => null }));
vi.mock("@/components/student/MobilitySuggestedDrawer", () => ({ MobilitySuggestedDrawer: () => null }));
vi.mock("@/components/student/WorkoutGuideDrawer", () => ({ WorkoutGuideDrawer: () => null }));
vi.mock("@/components/student/PreviewModeBar", () => ({ default: () => null }));
vi.mock("@/components/student/PreviousProtocolButton", () => ({ default: () => null }));
vi.mock("@/components/student/LoadProgressionDrawer", () => ({ LoadProgressionDrawer: () => null }));
vi.mock("@/components/student/WorkoutStrategyHeader", () => ({ default: () => null }));
vi.mock("@/components/student/WorkoutPeriodizationView", () => ({ default: () => null }));

import WorkoutPlan from "../WorkoutPlan";

const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); d.setHours(10, 0, 0, 0); return d.toISOString(); };
const assignment = {
  kind: "fullbody",
  payload: {
    note: "Use quando a semana apertar.",
    periodization: { enabled: false },
    dietRule: { training: "base", rest: "off" },
    workouts: [
      { key: "SC_A", focus: "Full Body A", exercises: [{ name: "Mob quadril", is_mobility: true }, { name: "Agachamento" }, { name: "Supino" }, { name: "Remada" }], invert: { mode: "consecutive" } },
      { key: "SC_B", focus: "Full Body B", exercises: [{ name: "Terra" }, { name: "Desenvolvimento" }], invert: { mode: "consecutive" } },
    ],
  },
};

const show = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><WorkoutPlan /></MemoryRouter>
    </QueryClientProvider>,
  );
};

describe("WorkoutPlan → Semana Corrida", () => {
  beforeEach(() => { h.busy = undefined; h.mutate.mockReset(); localStorage.clear(); });

  it("sem plano liberado: nada muda (sem seletor)", async () => {
    show();
    expect(await screen.findByText(/Treino A/)).toBeTruthy();
    expect(screen.queryByTestId("busy-week-switch")).toBeNull();
  });

  it("liberado mas desligado: mostra o seletor e os treinos do protocolo; ligar chama a troca", async () => {
    h.busy = { assignment, active: false, sessions: [] };
    show();
    const sw = await screen.findByTestId("busy-week-switch");
    expect(within(sw).getByRole("radio", { name: "Rotina normal" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText(/Treino A/)).toBeTruthy();
    await userEvent.click(within(sw).getByRole("radio", { name: "Semana corrida" }));
    expect(h.mutate).toHaveBeenCalledWith(true, expect.anything());
  });

  it("ligado: treinos do plano, próximo da rotação e ordem invertida porque treinou ontem", async () => {
    h.busy = { assignment, active: true, sessions: [{ workout_key: "SC_A", started_at: yesterday() }] };
    show();
    expect(await screen.findByText(/Semana corrida A/)).toBeTruthy();
    expect(screen.queryByText(/^Treino A$/)).toBeNull();
    // A foi ontem → próximo é o B
    expect(screen.getByRole("button", { name: /Iniciar próximo treino.*Semana corrida B/s })).toBeTruthy();
    expect(screen.getByTestId("inverted-SC_A")).toBeTruthy();
    expect(screen.getByTestId("busy-trained-yesterday")).toBeTruthy();
    expect(screen.getByText(/Use quando a semana apertar/)).toBeTruthy();
  });

  it("ordem invertida mantém a mobilidade antes e inverte a força", async () => {
    h.busy = { assignment, active: true, sessions: [{ workout_key: "SC_B", started_at: yesterday() }] };
    show();
    // O próximo (A) abre por padrão: força aparece invertida.
    const names = (await screen.findAllByTestId("ex")).map((e) => e.textContent);
    expect(names.slice(0, 3)).toEqual(["Remada", "Supino", "Agachamento"]);
  });
});
