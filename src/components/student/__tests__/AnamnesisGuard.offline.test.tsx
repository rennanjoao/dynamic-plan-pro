import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const anaResult = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: "aluna-1" } } } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => anaResult() }) }) }),
  },
}));
vi.mock("@/lib/coachAccessStatus", () => ({ fetchCoachBlocked: () => Promise.resolve(false) }));

import { AnamnesisGuard } from "../AnamnesisGuard";

const renderAt = () =>
  render(
    <MemoryRouter initialEntries={["/workout-plan"]}>
      <Routes>
        <Route path="/workout-plan" element={<AnamnesisGuard><p>TREINO</p></AnamnesisGuard>} />
        <Route path="/anamnesis" element={<p>FORMULÁRIO DE CADASTRO</p>} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => { localStorage.clear(); anaResult.mockReset(); });

describe("AnamnesisGuard sem internet", () => {
  it("anamnese enviada → mostra o treino e lembra no aparelho", async () => {
    anaResult.mockResolvedValue({ data: { submitted_at: "2026-01-01" }, error: null });
    renderAt();
    expect(await screen.findByText("TREINO")).toBeTruthy();
    expect(localStorage.getItem("anamnesis_done_aluna-1")).toBe("1");
  });

  it("sem sinal na academia NÃO manda para o cadastro", async () => {
    localStorage.setItem("anamnesis_done_aluna-1", "1");
    anaResult.mockResolvedValue({ data: null, error: { message: "Failed to fetch" } });
    renderAt();
    expect(await screen.findByText("TREINO")).toBeTruthy();
    expect(screen.queryByText("FORMULÁRIO DE CADASTRO")).toBeNull();
  });

  it("erro sem histórico no aparelho também deixa seguir", async () => {
    anaResult.mockResolvedValue({ data: null, error: { message: "Failed to fetch" } });
    renderAt();
    expect(await screen.findByText("TREINO")).toBeTruthy();
  });

  it("aluna que realmente não fez a anamnese continua sendo levada ao cadastro", async () => {
    anaResult.mockResolvedValue({ data: null, error: null });
    renderAt();
    expect(await screen.findByText("FORMULÁRIO DE CADASTRO")).toBeTruthy();
  });
});
