import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: "c1" } } } }) } },
}));
vi.mock("@/integrations/supabase/untyped", () => ({ sb: { from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [] }) }) }) }) } }));
vi.mock("@/components/coach/DietTemplateQuickPicker", () => ({ DietTemplateQuickPicker: () => null }));

import { DietTab } from "../protocol-builder/DietTab";
import { ProtocolPayloadSchema, type ProtocolPayload } from "@/lib/protocolSchema";

const food = (name: string, weight: string) => ({ name, baseName: name, weight });
const blank = (kind: string) => ({ kind, title: "Opção 2", notes: "", items: [{ name: "", weight: "" }] });

function payload(): ProtocolPayload {
  return ProtocolPayloadSchema.parse({
    setup: { split: "ABC", mealsCount: 2, carbCycle: false },
    meals: [
      {
        __id: "m1", name: "Café", time: "07:00",
        options: [
          { kind: "carb", title: "Opção 1", items: [food("Pão", "2 fatias")] }, blank("carb"),
          { kind: "protein", title: "Opção 1", items: [food("Ovos", "3 unidades")] }, blank("protein"),
          { kind: "fat", title: "Opção 1", items: [food("Azeite", "10ml")] }, blank("fat"),
        ],
      },
      {
        __id: "m2", name: "Almoço", time: "12:30", notes: "",
        options: [
          { kind: "carb", title: "Opção 1", items: [food("Arroz", "120g")] },
          { kind: "protein", title: "Opção 1", items: [food("Frango", "150g")] },
          { kind: "fat", title: "Opção 1", items: [food("Azeite", "5ml")] },
        ],
      },
    ],
  });
}

const spy = vi.fn();
function Harness() {
  const [p, setP] = useState(payload);
  return <DietTab payload={p} setPayload={(n) => { spy(n); setP(n); }} />;
}

describe("Aba Dieta enxuta", () => {
  beforeEach(() => spy.mockClear());

  it("refeições começam fechadas, uma linha cada, com os alimentos da Opção 1", () => {
    render(<Harness />);
    expect(screen.getByTestId("meal-summary-0").textContent).toMatch(/Café.*07:00.*Pão 2 fatias · Ovos 3 unidades · Azeite 10ml/);
    expect(screen.getByTestId("meal-summary-1").textContent).toMatch(/Almoço.*Arroz 120g/);
    expect(screen.queryAllByLabelText("Alimento")).toHaveLength(0);
  });

  it("abre uma refeição por vez", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByTestId("meal-summary-0"));
    expect(screen.getByDisplayValue("Café")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("meal-summary-1"));
    expect(screen.getByDisplayValue("Almoço")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Café")).toBeNull();
    expect(screen.getByTestId("meal-summary-0")).toBeInTheDocument();
  });

  it("Opção 2 vazia some; '+ Opção 2' mostra ela sem criar outra", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByTestId("meal-summary-0"));
    expect(screen.queryByTestId("option-0-carb-1")).toBeNull();
    await userEvent.click(screen.getByTestId("add-option-0-carb"));
    expect(screen.getByTestId("option-0-carb-1")).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it("'+ Opção 2' cria a opção quando não existe nenhuma escondida", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByTestId("meal-summary-1"));
    await userEvent.click(screen.getByTestId("add-option-1-carb"));
    const last = spy.mock.calls.at(-1)![0] as ProtocolPayload;
    expect(last.meals[1].options.filter((o) => o.kind === "carb")).toHaveLength(2);
    expect(screen.getByTestId("option-1-carb-1")).toBeInTheDocument();
  });

  it("substituição opcional só pelo menu ⋯ do alimento", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByTestId("meal-summary-1"));
    expect(screen.queryByText(/substituição opcional/i)).toBeNull();
    await userEvent.click(screen.getByTestId("food-1-carb-0-0-menu"));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Adicionar substituição/ }));
    const last = spy.mock.calls.at(-1)![0] as ProtocolPayload;
    expect(last.meals[1].options[0].items[0].substitution).toBeTruthy();
    expect(screen.getByText(/Substituição opcional \(não soma\)/i)).toBeInTheDocument();
  });

  it("observações aparecem só quando o coach pede", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByTestId("meal-summary-1"));
    expect(screen.queryByLabelText("Observação da opção")).toBeNull();
    expect(screen.queryByPlaceholderText(/tomar 30 min após o treino/)).toBeNull();
    await userEvent.click(screen.getByTestId("option-notes-add-1-carb-0"));
    expect(screen.getByLabelText("Observação da opção")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("meal-notes-add-1"));
    expect(screen.getByPlaceholderText(/tomar 30 min após o treino/)).toBeInTheDocument();
  });

  it("nova refeição já abre para preencher", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: /Adicionar Nova Refeição/ }));
    expect(screen.getByDisplayValue("Refeição 3")).toBeInTheDocument();
    const card = screen.getByTestId("meal-card-2");
    expect(within(card).getAllByLabelText("Alimento")).toHaveLength(3);
  });
});
