/**
 * Ligação da semana do ciclo na tela de treino da aluna: o WorkoutPlan precisa buscar
 * a data em que ela abriu o protocolo e entregá-la ao hook — é essa data que faz a
 * semana correr pelo calendário. (O hook e a regra são testados em useCurrentPeriodizationWeek.test.)
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import WorkoutPlan from "../WorkoutPlan";

const h = vi.hoisted(() => ({
  protocol: null as null | Record<string, unknown>,
  hookCalls: [] as unknown[][],
}));

vi.mock("@/hooks/useAuthUserId", () => ({ useAuthUserId: () => "u1" }));
vi.mock("@/hooks/useWakeLock", () => ({ useWakeLock: () => {} }));
vi.mock("@/hooks/useHighlightTarget", () => ({ useHighlightTarget: () => {} }));
vi.mock("@/hooks/useWorkoutSession", () => ({ isSessionStale: () => false }));
vi.mock("@/hooks/useCurrentPeriodizationWeek", () => ({
  useCurrentPeriodizationWeek: (...args: unknown[]) => {
    h.hookCalls.push(args);
    return 2;
  },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      let cols: string[] | null = null;
      const chain: Record<string, unknown> = {};
      for (const m of ["eq", "order", "limit", "not", "in"]) chain[m] = () => chain;
      // Devolve só as colunas que a consulta PEDIU — esquecer de selecionar a data tem de quebrar o teste.
      chain.select = (c: string) => { cols = c.split(",").map((x) => x.trim()); return chain; };
      chain.maybeSingle = async () => {
        if (table !== "protocols" || !h.protocol) return { data: null, error: null };
        const row = h.protocol;
        return { data: cols ? Object.fromEntries(cols.filter((c) => c in row).map((c) => [c, row[c]])) : row, error: null };
      };
      return chain;
    },
    channel: () => { const ch: Record<string, unknown> = {}; ch.on = () => ch; ch.subscribe = () => ch; return ch; },
    removeChannel: () => {},
  },
}));

// Filhos substituídos por marcadores simples (só importa o que a tela entrega a eles).
vi.mock("@/components/shared/ExerciseNameButton", () => ({ ExerciseNameButton: () => null }));
vi.mock("@/components/student/ProtocolQuestionButton", () => ({ default: () => null }));
vi.mock("@/components/student/WorkoutMode", () => ({ default: () => null }));
vi.mock("@/components/student/WorkoutHistory", () => ({ default: () => null }));
vi.mock("@/components/student/MobilityExerciseRow", () => ({ MobilityExerciseRow: () => null }));
vi.mock("@/components/student/MobilitySuggestedDrawer", () => ({ MobilitySuggestedDrawer: () => null }));
vi.mock("@/components/student/WorkoutGuideDrawer", () => ({ WorkoutGuideDrawer: () => null }));
vi.mock("@/components/student/PreviewModeBar", () => ({ default: () => null }));
vi.mock("@/components/student/PreviousProtocolButton", () => ({ default: () => null }));
vi.mock("@/components/student/LoadProgressionDrawer", () => ({ LoadProgressionDrawer: () => null }));
vi.mock("@/components/ui/PageLoader", async () => {
  const React = await import("react");
  return { PageLoader: () => React.createElement("div", { "data-testid": "loader" }) };
});
vi.mock("@/components/student/WorkoutPeriodizationView", async () => {
  const React = await import("react");
  return { default: (p: { initialWeek: number }) => React.createElement("div", { "data-testid": "period-view", "data-week": String(p.initialWeek) }) };
});
vi.mock("@/components/student/WorkoutStrategyHeader", async () => {
  const React = await import("react");
  return { default: (p: { currentWeek: number }) => React.createElement("div", { "data-testid": "strategy-header", "data-week": String(p.currentWeek) }) };
});

const weeks = ["Peso", "Técnica", "Técnica", "Resistência"].map((label) => ({ label, reps: "10 a 12 reps", sets: "3", rest: "60s" }));
const protocol = (extra: Record<string, unknown>) => ({
  id: "p1",
  coach_id: "c1",
  payload: {
    workouts: [{ key: "A", focus: "Peito", exercises: [{ name: "Supino", sets: "3", reps: "10 a 12 reps", rest: "60s" }] }],
    periodization: { enabled: true, weeks },
  },
  ...extra,
});

const show = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><WorkoutPlan /></MemoryRouter>
    </QueryClientProvider>,
  );
};

describe("WorkoutPlan → semana do ciclo", () => {
  beforeEach(() => { h.hookCalls.length = 0; h.protocol = null; localStorage.clear(); });

  it("entrega ao hook a data em que a aluna abriu o protocolo", async () => {
    h.protocol = protocol({ student_first_viewed_at: "2026-09-27T12:00:00.000Z" });
    show();
    await screen.findByTestId("period-view");
    expect(h.hookCalls.at(-1)).toEqual([true, 4, "2026-09-27T12:00:00.000Z"]);
  });

  it("a semana devolvida pelo hook é a que a tela mostra e a que abre por padrão", async () => {
    h.protocol = protocol({ student_first_viewed_at: "2026-09-27T12:00:00.000Z" });
    show();
    expect((await screen.findByTestId("period-view")).dataset.week).toBe("2");
    expect(screen.getByTestId("strategy-header").dataset.week).toBe("2");
  });

  it("protocolo que ela ainda não abriu (sem data): entrega null (o cálculo trata como Semana 1)", async () => {
    h.protocol = protocol({ student_first_viewed_at: null });
    show();
    await screen.findByTestId("period-view");
    expect(h.hookCalls.at(-1)?.[2]).toBeNull();
  });
});
