/**
 * Histórico de Treinos: série pulada não é série feita (não entra na contagem de séries).
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import WorkoutHistory from "../WorkoutHistory";

const records = [{
  id: "s1", workout_key: "A", started_at: "2026-10-02T12:00:00Z", periodization_key: null, is_deload_week: false,
  workout_sets: [
    { exercise_name: "Supino", set_number: 1, weight_kg: 20, reps: 12, perceived_effort: 1, skipped: false },
    { exercise_name: "Supino", set_number: 2, weight_kg: 20, reps: 10, perceived_effort: 2, skipped: false },
    { exercise_name: "Supino", set_number: 3, weight_kg: 0, reps: 0, perceived_effort: null, skipped: true },
  ],
}];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => Promise.resolve({ data: table === "workout_sessions" ? records : [], error: null }),
    };
    return chain;
  } },
}));

describe("WorkoutHistory — séries puladas", () => {
  it("conta só as séries feitas (2 feitas + 1 pulada = 2 séries)", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><WorkoutHistory userId="student-1" /></QueryClientProvider>);
    expect(await screen.findByText("2 séries")).toBeTruthy();
    expect(screen.queryByText("3 séries")).toBeNull();
  });
});
