/**
 * StructuredMealsViewer.cooked.test.tsx
 *
 * Regra: o coach prescreve CRU; o aluno pode alternar para COZIDO só para facilitar a pesagem.
 * A alternância não pode induzir o aluno a pesar errado:
 *  - peso e nome andam juntos ("(cru)" nunca aparece ao lado de peso cozido);
 *  - item já cozido não é convertido de novo;
 *  - a substituição converte com o PRÓPRIO fator (não herda o do item principal).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import StructuredMealsViewer from "@/components/student/StructuredMealsViewer";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: "student-1" } } } }) },
  },
}));

vi.mock("@/hooks/useMealCheckins", () => ({
  useMealCheckins: () => ({ checked: [], toggle: vi.fn(), doneCount: 0, progressPct: 0 }),
}));

const taco = (name: string, rawWeight: number, extra: Record<string, unknown> = {}) => ({
  name,
  baseName: name,
  isTaco: true,
  rawWeight,
  weight: `${rawWeight}g`,
  ...extra,
});

function buildPayload(): any {
  return {
    setup: { carbCycle: false },
    macros: { calories: 2200, protein: 160, carbs: 250, fat: 55, water: 3, goal: "hipertrofia" },
    guidelines: { training: "", diet: "", weekOrganization: "", supplementation: "" },
    workouts: [],
    meals: [
      {
        name: "Almoço",
        time: "12:30",
        macros: { carbs: 0, protein: 0, fat: 0 },
        substitutions: { carb: [], protein: [], fat: [] },
        options: [
          {
            kind: "carb",
            items: [
              // principal: arroz cru (2,7×) com substituição macarrão cru (2,5×)
              taco("Arroz branco (cru)", 100, { substitution: taco("Macarrão de trigo comum (cru)", 100) }),
              // já cozido → nunca converte
              taco("Feijão carioca (cozido)", 100, { valuesArCooked: true }),
              // sem conversão real
              taco("Banana prata (crua)", 100),
            ],
          },
          {
            kind: "protein",
            items: [
              taco("Frango peito s/ pele (cru)", 150),
              taco("Frango peito s/ pele (grelhado)", 120),
            ],
          },
          {
            kind: "veg",
            items: [taco("Brócolis (cru)", 100)],
          },
        ],
      },
    ],
    carbCycle: {},
    carbCycleNotes: {},
    carbCycleHighPct: 15,
    carbCycleLowPct: 15,
    cardio: [],
    supplements: [],
    supplementCombos: [],
    periodization: { enabled: false, weeks: [], overrides: {} },
    weekDays: {},
    restNotes: "",
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

/** Texto da linha do alimento (nome + peso) — ancora no nome e sobe até a linha. */
function rowText(nameRegex: RegExp): string {
  const el = screen.getAllByText(nameRegex)[0];
  const row = el.closest("li, div, p") as HTMLElement;
  return (row?.parentElement?.textContent ?? row?.textContent ?? "").replace(/\s+/g, " ");
}

describe("StructuredMealsViewer — Cru × Cozido", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(2026, 7, 7, 12, 0, 0) });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("modo Cru (padrão): nomes e pesos exatamente como o coach prescreveu", () => {
    render(<StructuredMealsViewer payload={buildPayload()} />, { wrapper });
    expect(screen.getByText("Arroz branco (cru)")).toBeInTheDocument();
    expect(rowText(/^Arroz branco \(cru\)$/)).toMatch(/100\s?g/);
    expect(screen.getByText("Frango peito s/ pele (cru)")).toBeInTheDocument();
    // nada foi renomeado para cozido (o único "(cozido)" da tela é o feijão que o coach já prescreveu cozido)
    expect(screen.queryByText("Arroz branco (cozido)")).not.toBeInTheDocument();
    expect(screen.queryByText("Frango peito s/ pele (cozido)")).not.toBeInTheDocument();
    expect(screen.queryByText("Macarrão de trigo comum (cozido)")).not.toBeInTheDocument();
  });

  it("modo Cozido: peso converte E o nome vira cozido — nunca '(cru)' ao lado de peso cozido", () => {
    render(<StructuredMealsViewer payload={buildPayload()} />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: /^Cozido$/ }));

    // arroz 100 g cru × 2,7 = 270 g, rotulado como cozido
    expect(screen.queryByText("Arroz branco (cru)")).not.toBeInTheDocument();
    expect(rowText(/^Arroz branco \(cozido\)$/)).toMatch(/270\s?g/);

    // frango 150 g cru × 0,7 = 105 g, rotulado como cozido
    expect(screen.queryByText("Frango peito s/ pele (cru)")).not.toBeInTheDocument();
    expect(rowText(/^Frango peito s\/ pele \(cozido\)$/)).toMatch(/105\s?g/);
  });

  it("modo Cozido: a SUBSTITUIÇÃO usa o próprio fator (macarrão 100 g × 2,5 = 250 g, não × 2,7 do arroz)", () => {
    render(<StructuredMealsViewer payload={buildPayload()} />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: /^Cozido$/ }));
    const txt = document.body.textContent!.replace(/\s+/g, " ");
    expect(txt).toMatch(/Macarrão de trigo comum \(cozido\)[^0-9]*250\s?g/);
    expect(txt).not.toMatch(/Macarrão de trigo comum \(cozido\)[^0-9]*270/);
  });

  it("modo Cozido: batata fica pelo peso CRU — nome e peso não mudam", () => {
    const p = buildPayload();
    p.meals[0].options[0].items.push(taco("Batata inglesa (crua)", 200));
    render(<StructuredMealsViewer payload={p} />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: /^Cozido$/ }));
    expect(rowText(/^Batata inglesa \(crua\)$/)).toMatch(/200\s?g/);
    expect(screen.queryByText(/Batata inglesa \(cozida\)/)).not.toBeInTheDocument();
  });

  it("modo Cozido: item já cozido e item sem conversão mantêm nome e peso", () => {
    render(<StructuredMealsViewer payload={buildPayload()} />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: /^Cozido$/ }));
    expect(rowText(/^Feijão carioca \(cozido\)$/)).toMatch(/100\s?g/);
    expect(rowText(/^Frango peito s\/ pele \(grelhado\)$/)).toMatch(/120\s?g/);
    expect(rowText(/^Banana prata \(crua\)$/)).toMatch(/100\s?g/);
    expect(rowText(/^Brócolis \(cru\)$/)).toMatch(/100\s?g/);
  });

  it("voltar para Cru restaura nomes e pesos originais", () => {
    render(<StructuredMealsViewer payload={buildPayload()} />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: /^Cozido$/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Cru$/ }));
    expect(rowText(/^Arroz branco \(cru\)$/)).toMatch(/100\s?g/);
    expect(rowText(/^Frango peito s\/ pele \(cru\)$/)).toMatch(/150\s?g/);
  });

  it("a alternância NÃO muda os macros exibidos do dia", () => {
    render(<StructuredMealsViewer payload={buildPayload()} />, { wrapper });
    const before = document.body.textContent!.match(/\d+\s?kcal/gi)?.join("|");
    fireEvent.click(screen.getByRole("button", { name: /^Cozido$/ }));
    const after = document.body.textContent!.match(/\d+\s?kcal/gi)?.join("|");
    expect(after).toBe(before);
  });

  it("toggle some quando NADA na dieta converte (ex.: só frutas e aveia)", () => {
    const p = buildPayload();
    p.meals[0].options = [{ kind: "carb", items: [taco("Banana prata (crua)", 100), taco("Aveia em flocos", 40)] }];
    render(<StructuredMealsViewer payload={p} />, { wrapper });
    expect(screen.queryByRole("button", { name: /^Cozido$/ })).not.toBeInTheDocument();
  });
});
