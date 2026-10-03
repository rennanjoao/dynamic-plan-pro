import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import WorkoutHistory from "../WorkoutHistory";

const filters: string[] = [];
const records = [
  { id: "one", workout_key: "A", started_at: "2026-10-02T12:00:00Z", periodization_key: "peso", is_deload_week: false, workout_sets: [{ exercise_name: "Supino", weight_kg: 30, set_number: 1 }] },
  { id: "two", workout_key: "B", started_at: "2026-09-20T12:00:00Z", periodization_key: "tecnica", is_deload_week: false, workout_sets: [{ exercise_name: "Remada", weight_kg: 20, set_number: 1 }] },
];
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => {
    let phase: string | null = null;
    const chain = {
      select: () => chain,
      eq: (column: string, value: string) => { if (column === "periodization_key") { phase = value; filters.push(value); } return chain; },
      order: () => chain,
      limit: () => Promise.resolve({ data: table === "workout_sessions" ? records.filter((r) => !phase || r.periodization_key === phase) : [], error: null }),
    };
    return chain;
  } },
}));

function show(phase?: string | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><WorkoutHistory userId="student-1" periodizationKey={phase} /></QueryClientProvider>);
}

describe("WorkoutHistory por fase", () => {
  beforeEach(() => { filters.length = 0; });
  it("filtra a fase atual, depois mostra todas com sufixo na data", async () => {
    show("peso");
    expect(screen.getByRole("button", { name: "Fase atual · Peso" }).getAttribute("aria-pressed")).toBe("true");
    await screen.findByText("Treino A");
    expect(screen.queryByText("Treino B")).toBeNull();
    expect(filters).toContain("peso");
    await userEvent.click(screen.getByRole("button", { name: "Todas" }));
    await screen.findByText("Treino B");
    expect(screen.getByRole("button", { name: "Todas" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/set\. de 2026 · Técnica/)).toBeTruthy();
  });

  it("sem periodização não exibe filtro", async () => {
    show(null);
    await screen.findByText("Treino B");
    expect(screen.queryByRole("button", { name: "Todas" })).toBeNull();
    expect(filters).toHaveLength(0);
  });

  it("fase vazia oferece ver todas", async () => {
    show("deload");
    await screen.findByText("Nenhum treino na fase Deload ainda.");
    await userEvent.click(screen.getByRole("button", { name: "Ver todas" }));
    await waitFor(() => expect(screen.getByText("Treino A")).toBeTruthy());
  });
});