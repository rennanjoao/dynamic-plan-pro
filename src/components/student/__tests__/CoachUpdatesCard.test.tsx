/**
 * CoachUpdatesCard.test.tsx
 *
 * Cobre três cenários do card discreto de "atualizações do coach":
 *   1. sem linha pendente em `protocol_change_events` → nada é renderizado
 *      (o card fica invisível, respeitando a política de UI);
 *   2. com linha pendente → o card aparece; ao clicar, o sheet abre com
 *      os itens ordenados por importância (alta → media → baixa);
 *   3. clicar em "Marcar tudo como visto" dispara um UPDATE no Supabase
 *      com `seen_at` preenchido e o card some da tela.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

// ─── Mocks compartilhados ─────────────────────────────────────────────
let pendingRow: any = null;
const updateCalls: Array<{ patch: any; id: string }> = [];

vi.mock("@/hooks/useStudentData", () => ({
  useStudentData: () => ({ studentId: "student-1" }),
}));

vi.mock("@/integrations/supabase/client", () => {
  const selectChain = () => {
    const chain: any = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.is = () => chain;
    chain.order = () => chain;
    chain.limit = () => chain;
    chain.maybeSingle = async () => ({ data: pendingRow, error: null });
    return chain;
  };
  const updateChain = (patch: any) => {
    const chain: any = {};
    chain.eq = async (_col: string, id: string) => {
      updateCalls.push({ patch, id });
      // simula o efeito: após marcar seen_at, não há mais linha pendente
      if (patch.seen_at) pendingRow = null;
      return { error: null };
    };
    return chain;
  };
  return {
    supabase: {
      from: (_table: string) => ({
        select: () => selectChain().select(),
        update: (patch: any) => updateChain(patch),
      }),
    },
  };
});

// ─── Helper para carregar o componente sob teste depois dos mocks ─────
async function renderCard() {
  const { default: CoachUpdatesCard } = await import("../CoachUpdatesCard");
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const utils = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <CoachUpdatesCard />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { qc, ...utils };
}

beforeEach(() => {
  pendingRow = null;
  updateCalls.length = 0;
  cleanup();
});

describe("CoachUpdatesCard", () => {
  it("sem linha pendente → não renderiza nada", async () => {
    pendingRow = null;
    const { container } = await renderCard();
    // Espera a query resolver — como não há dados, o componente devolve null.
    await waitFor(() => {
      expect(container.textContent).toBe("");
    });
  });

  it("com linha pendente → card aparece; clicar abre o sheet com itens em ordem alta→media→baixa", async () => {
    pendingRow = {
      id: "evt-1",
      created_at: new Date().toISOString(),
      seen_item_indexes: [],
      changes: [
        { category: "treino",     importance: "baixa", label: "Ajuste em Supino Reto",           target_tab: "treino", target_anchor: null },
        { category: "dieta",      importance: "alta",  label: "Nova refeição adicionada: Ceia",  target_tab: "dieta",  target_anchor: null },
        { category: "suplemento", importance: "media", label: "Whey teve dose alterada",         target_tab: "suplementos", target_anchor: null },
      ],
    };
    await renderCard();
    const trigger = await screen.findByRole("button", { name: /atualizações do coach/i });
    await userEvent.click(trigger);

    // 3 botões-item dentro do sheet + o "Marcar tudo como visto"
    const itemButtons = await screen.findAllByRole("button", { name: /supino|ceia|whey/i });
    expect(itemButtons).toHaveLength(3);
    // Ordem de importância: alta → media → baixa
    expect(itemButtons[0]).toHaveTextContent(/Ceia/i);
    expect(itemButtons[1]).toHaveTextContent(/Whey/i);
    expect(itemButtons[2]).toHaveTextContent(/Supino/i);
  });

  it("'Marcar tudo como visto' → UPDATE com seen_at + card some", async () => {
    pendingRow = {
      id: "evt-2",
      created_at: new Date().toISOString(),
      seen_item_indexes: [],
      changes: [
        { category: "treino", importance: "alta", label: "Mudança 1", target_tab: "treino", target_anchor: null },
        { category: "dieta",  importance: "baixa", label: "Mudança 2", target_tab: "dieta",  target_anchor: null },
      ],
    };
    const { container } = await renderCard();
    await userEvent.click(await screen.findByRole("button", { name: /atualizações do coach/i }));
    await userEvent.click(await screen.findByRole("button", { name: /marcar tudo como visto/i }));

    await waitFor(() => {
      expect(updateCalls.length).toBeGreaterThan(0);
    });
    const call = updateCalls[updateCalls.length - 1];
    expect(call.id).toBe("evt-2");
    expect(call.patch.seen_at).toBeTruthy();
    expect(Array.isArray(call.patch.seen_item_indexes)).toBe(true);
    expect(call.patch.seen_item_indexes).toEqual([0, 1]);

    // O mock zera pendingRow após seen_at, então o card desaparece na próxima query.
    await waitFor(() => {
      expect(container.querySelector("button[aria-label='Ver atualizações do coach']")).toBeNull();
    });
  });
});