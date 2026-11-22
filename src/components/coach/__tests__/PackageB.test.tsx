/**
 * Pacote B da auditoria (21/11/2026): uma fonte para cada dado e um botão
 * "Modelos" igual em todas as abas.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock("@/integrations/supabase/untyped", () => {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit"]) chain[m] = () => chain;
  (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
  return { sb: { from: () => chain } };
});

import { MacrosTab } from "../protocol-builder/MacrosTab";
import { WeekStripEditor } from "../protocol-builder/WorkoutsTabParts";
import { ModelsMenu } from "../protocol-builder/ModelsMenu";
import ProtocolHistoryDialog from "../ProtocolHistoryDialog";
import { ProtocolPayloadSchema } from "@/lib/protocolSchema";

function payload(extra: Record<string, unknown> = {}) {
  return ProtocolPayloadSchema.parse({
    setup: { split: "ABC", mealsCount: 2, carbCycle: true, trainingDaysPerWeek: 5 },
    workouts: [{ key: "A", exercises: [] }, { key: "B", exercises: [] }, { key: "C", exercises: [] }],
    weekDays: { seg: "A", ter: "B", qua: "REST", qui: "C", sex: "A", sab: "REST", dom: "REST" },
    carbCycle: { seg: "high", ter: "base", qua: "off", qui: "base", sex: "high", sab: "off", dom: "off" },
    meals: [{ name: "Almoço", day_type: "training" }],
    ...extra,
  });
}

describe("Macros: dias de treino e carbo por dia vêm da semana do Treino", () => {
  it("dias de treino = contados da semana (4), sem campo para digitar", () => {
    render(<MacrosTab payload={payload()} setPayload={vi.fn()} onEditWeek={vi.fn()} />);
    expect(screen.getByTestId("training-days-value").textContent).toBe("4");
    expect(within(screen.getByTestId("training-days")).queryByRole("spinbutton")).toBeNull();
  });

  it("semana vazia: usa o número salvo e oferece montar a semana", async () => {
    const onEditWeek = vi.fn();
    render(<MacrosTab payload={payload({ weekDays: {} })} setPayload={vi.fn()} onEditWeek={onEditWeek} />);
    expect(screen.getByTestId("training-days-value").textContent).toBe("5");
    await userEvent.click(screen.getByRole("button", { name: /Montar semana/ }));
    expect(onEditWeek).toHaveBeenCalled();
  });

  it("tipo de cada dia é só leitura aqui; 'Editar na semana' leva ao Treino", async () => {
    const setPayload = vi.fn();
    const onEditWeek = vi.fn();
    render(<MacrosTab payload={payload()} setPayload={setPayload} onEditWeek={onEditWeek} />);
    const summary = screen.getByTestId("carb-week-summary");
    expect(summary.textContent).toMatch(/2 Alto · 2 Base · 3 Baixo/);
    expect(within(summary).getAllByRole("button")).toHaveLength(1);
    await userEvent.click(screen.getByTestId("edit-carb-week"));
    expect(onEditWeek).toHaveBeenCalled();
    expect(setPayload).not.toHaveBeenCalled();
  });
});

describe("Faixa da semana: carbo só com o ciclo ligado", () => {
  const props = {
    workouts: [{ key: "A" }],
    weekDays: { seg: "A" },
    carbCycle: { seg: "base" },
    today: "seg",
    letterOf: (k: string) => k,
    onSetDay: vi.fn(),
    onCycleCarb: vi.fn(),
  };

  it("ciclo ligado: mostra o selo de carbo de cada dia", () => {
    render(<WeekStripEditor {...props} showCarb />);
    expect(screen.getByTestId("carb-seg")).toBeInTheDocument();
  });

  it("ciclo desligado: sem selos e com atalho para ligar em Macros", async () => {
    const onOpenMacros = vi.fn();
    render(<WeekStripEditor {...props} showCarb={false} onOpenMacros={onOpenMacros} />);
    expect(screen.queryByTestId("carb-seg")).toBeNull();
    await userEvent.click(screen.getByTestId("week-strip-open-macros"));
    expect(onOpenMacros).toHaveBeenCalled();
  });
});

describe("Modelos: o mesmo botão em todas as abas", () => {
  it("mostra as seções da aba e a biblioteca no rodapé", async () => {
    const onOpenLibrary = vi.fn();
    render(
      <ModelsMenu
        sections={[
          { title: "Dieta inteira", content: <button type="button">Aplicar dieta</button> },
          { title: "Uma refeição", content: (close) => <button type="button" onClick={close}>Adicionar refeição salva</button> },
        ]}
        onOpenLibrary={onOpenLibrary}
      />,
    );
    await userEvent.click(screen.getByTestId("models-menu"));
    expect(await screen.findByText("Dieta inteira")).toBeInTheDocument();
    expect(screen.getByText("Uma refeição")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("models-menu-library"));
    expect(onOpenLibrary).toHaveBeenCalled();
  });
});

describe("Histórico único", () => {
  it("duas abas: alterações enviadas e versões publicadas", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ProtocolHistoryDialog open onOpenChange={vi.fn()} studentId="s1" studentName="Ana" protocolId={null} onRestore={vi.fn()} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/Nenhuma alteração de protocolo registrada/)).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("history-tab-versions"));
    expect(await screen.findByText(/As versões aparecem aqui depois da primeira publicação/)).toBeInTheDocument();
  });
});
