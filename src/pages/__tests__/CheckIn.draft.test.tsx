import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Sem check-in anterior → a tela abre direto em "novo check-in".
vi.mock("@/integrations/supabase/untyped", () => {
  const q: Record<string, unknown> = {};
  for (const m of ["from", "select", "eq", "order", "limit"]) q[m] = () => q;
  q.maybeSingle = () => Promise.resolve({ data: null, error: null });
  return { sb: q };
});
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({}) , functions: { invoke: vi.fn() } } }));
vi.mock("@/hooks/useStudentData", () => ({
  useStudentData: () => ({ studentId: "aluna-1", anamnesis: { baseline_metrics: { peso: 70 }, payload: {} } }),
}));
vi.mock("sonner", () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));

import CheckIn from "../CheckIn";
import { toast } from "sonner";

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/check-in"]}>
        <CheckIn />
      </MemoryRouter>
    </QueryClientProvider>,
  );

const DRAFT_KEY = "checkin_draft_v1_aluna-1_new";
const PLACEHOLDER = /Ex: horários, volume de comida/;

beforeEach(() => {
  localStorage.clear();
  vi.mocked(toast.info).mockClear();
});
afterEach(() => cleanup());

describe("Check-in — rascunho automático", () => {
  it("guarda a resposta e recupera depois que a página recarrega", async () => {
    const first = renderPage();
    const field = await screen.findByPlaceholderText(PLACEHOLDER);
    fireEvent.change(field, { target: { value: "Fome à noite" } });

    await waitFor(() => {
      const raw = localStorage.getItem(DRAFT_KEY);
      expect(raw && JSON.parse(raw).data.dieta_dificuldade).toBe("Fome à noite");
    }, { timeout: 2000 });

    // Simula o celular recarregando a página no meio do preenchimento.
    first.unmount();
    renderPage();
    const restored = await screen.findByPlaceholderText(PLACEHOLDER);
    await waitFor(() => expect((restored as HTMLTextAreaElement).value).toBe("Fome à noite"));
    expect(toast.info).toHaveBeenCalledWith(
      "Recuperamos o check-in que você estava preenchendo.",
      expect.objectContaining({ action: expect.objectContaining({ label: "Começar do zero" }) }),
    );
  });

  it("sem nada preenchido não cria rascunho nem mostra aviso", async () => {
    renderPage();
    await screen.findByPlaceholderText(PLACEHOLDER);
    await act(async () => { await new Promise((r) => setTimeout(r, 700)); });
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(toast.info).not.toHaveBeenCalled();
  });
});
