import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { todayKey } from "@/lib/weekCycle";

const otherDay = todayKey() === "seg" ? "ter" : "seg";
const payload = {
  guidelines: { supplementation: "Durma 8h" },
  supplements: [
    { name: "Creatina", dose: "5 g", timing: "Pós-treino" },
    { name: "Manipulado do dia", dose: "1 cápsula", timing: "Noite", category: "hormonio_manipulado", weeklyFrequency: [todayKey()] },
    { name: "Manipulado de outro dia", dose: "1 cápsula", timing: "Noite", category: "hormonio_manipulado", weeklyFrequency: [otherDay] },
  ],
};

vi.mock("@/hooks/useAuthUserId", () => ({ useAuthUserId: () => "aluna-1" }));
vi.mock("@/hooks/useHighlightTarget", () => ({ useHighlightTarget: () => {} }));
vi.mock("@/components/student/PreviewModeBar", () => ({ default: () => null }));
vi.mock("@/components/student/ProtocolQuestionButton", () => ({ default: () => null }));
vi.mock("@/integrations/supabase/client", () => {
  const q: Record<string, unknown> = {};
  for (const m of ["from", "select", "eq", "order", "limit"]) q[m] = () => q;
  q.maybeSingle = () => Promise.resolve({ data: { id: "p1", payload }, error: null });
  return { supabase: q };
});

import Supplements from "../Supplements";

describe("Diretrizes & Suplementação — faixa Hoje", () => {
  it("mostra só o que é de hoje, aberto, sem precisar expandir nada", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter><Supplements /></MemoryRouter>
      </QueryClientProvider>,
    );
    const today = await screen.findByTestId("supplements-today");
    expect(within(today).getByText("Creatina")).toBeTruthy();
    expect(within(today).getByText("Manipulado do dia")).toBeTruthy();
    expect(within(today).queryByText("Manipulado de outro dia")).toBeNull();
  });
});
