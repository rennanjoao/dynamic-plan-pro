import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { DATA } = vi.hoisted(() => {
  const mk = (id: string, at: string, week: number, ...v: [number, number][]) => v.map(([w, r], i) => ({
    id: `${id}-${i}`, session_id: id, exercise_name: "Agachamento", exercise_key: "agachamento", swapped_from_name: null,
    set_number: i + 1, weight_kg: w, reps: r, executed_at: at, periodization_week: week, periodization_key: null,
  }));
  return { DATA: [...mk("a", "2026-10-02T10:00:00Z", 0, [11, 4]), ...mk("b", "2026-09-25T10:00:00Z", 2, [8, 15])] };
});

interface Query { select: () => Query; eq: () => Query; order: () => Query; range: (from: number) => Promise<{ data: typeof DATA; error: null }> }
vi.mock("@/integrations/supabase/client", () => {
  const query: Query = { select: () => query, eq: () => query, order: () => query, range: (from: number) => Promise.resolve({ data: from === 0 ? DATA : [], error: null }) };
  return { supabase: { from: () => query } };
});
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

import { LoadProgressionDrawer } from "../LoadProgressionDrawer";

const workouts = [{ key: "A", exercises: [{ name: "Agachamento" }] }];
const open = async (viewedWeek?: number) => {
  const view = render(<LoadProgressionDrawer userId="u" workouts={workouts} periodizationEnabled currentWeek={0} viewedWeek={viewedWeek} todayWorkoutKey="A" />);
  fireEvent.click(screen.getByText("Como está minha progressão de carga?"));
  await waitFor(() => screen.getByText("Agachamento"));
  return view;
};

describe("progressão acompanha a semana que o aluno está vendo", () => {
  it("sem escolha manual segue a semana atual do sistema", async () => {
    await open();
    expect(screen.getByText(/Semana atual · Sem\. 1/)).toBeTruthy();
    expect(screen.getByText(/Última vez: 11 kg × 4/)).toBeTruthy();
    expect(screen.queryByText(/Você está vendo a Sem\./)).toBeNull();
  });

  it("com semana escolhida mostra os registros dela e avisa qual é a semana atual", async () => {
    await open(2);
    expect(screen.getByText(/Semana escolhida · Sem\. 3/)).toBeTruthy();
    expect(screen.getByText("Você está vendo a Sem. 3 do plano. Sua semana atual é a Sem. 1.")).toBeTruthy();
    expect(screen.getByText(/Última vez: 8 kg × 15/)).toBeTruthy();
    expect(screen.queryByText(/Última vez: 11 kg × 4/)).toBeNull();
  });

  it("volta a acompanhar a semana atual quando a escolha some", async () => {
    const view = await open(2);
    view.rerender(<LoadProgressionDrawer userId="u" workouts={workouts} periodizationEnabled currentWeek={0} viewedWeek={undefined} todayWorkoutKey="A" />);
    expect(screen.getByText(/Semana atual · Sem\. 1/)).toBeTruthy();
    expect(screen.getByText(/Última vez: 11 kg × 4/)).toBeTruthy();
  });

  it("'Todas as semanas' continua mostrando tudo, agrupado", async () => {
    await open(2);
    fireEvent.click(screen.getByText("Todas as semanas"));
    expect(screen.queryByText(/Você está vendo a Sem\./)).toBeNull();
    fireEvent.click(screen.getByText("Agachamento"));
    await waitFor(() => screen.getByText("Semana 1"));
    expect(screen.getByText("Semana 3")).toBeTruthy();
  });
});
