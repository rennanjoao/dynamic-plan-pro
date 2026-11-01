import React, { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: () => Promise.resolve({ data: { session: null } }) } },
}));
vi.mock("@/integrations/supabase/untyped", () => ({ sb: { from: () => ({}) } }));
vi.mock("@/lib/prescriptionMemory", () => ({ loadCoachProfile: () => Promise.resolve(null) }));
vi.mock("@/components/coach/DietTemplateQuickPicker", () => ({ DietTemplateQuickPicker: () => null }));

import { DietTab } from "../protocol-builder/DietTab";
import { makeEmptyMeal } from "@/lib/protocolSchema";

const item = (baseName: string, grams: number, weight = `${grams}g`) => ({ name: baseName, baseName, weight, rawWeight: grams, isTaco: true });

function payloadWith(carb: any[], protein: any[] = []) {
  const meal: any = makeEmptyMeal("Almoço");
  meal.options = [
    { kind: "carb", title: "Opção 1", items: carb.length ? carb : [{ name: "", weight: "" }] },
    { kind: "protein", title: "Opção 1", items: protein.length ? protein : [{ name: "", weight: "" }] },
    { kind: "fat", title: "Opção 1", items: [{ name: "", weight: "" }] },
  ];
  return { setup: { split: "ABC", mealsCount: 5, carbCycle: false, trainingDaysPerWeek: 5 }, meals: [meal], macros: { calories: 2200, protein: 160, carbs: 250, fat: 55, fiber: 25, water: 3, goal: "hipertrofia" } } as any;
}

function Harness({ initial }: { initial: any }) {
  const [payload, setPayload] = useState(initial);
  return <DietTab payload={payload} setPayload={setPayload} />;
}

describe("DietTab: fibra é contabilizada quando o alimento é preenchido", () => {
  it("arroz + feijão cozidos (TACO) entram na fibra do dia, da refeição e da opção, sem aviso", () => {
    render(<Harness initial={payloadWith([item("Arroz branco (cozido)", 200), item("Feijão carioca (cozido)", 100)])} />);
    // 200 g × 1,56 + 100 g × 8,51 = 11,63 g
    expect(screen.getByText("12/25")).toBeTruthy(); // placar do dia (arredondado)
    expect(screen.getAllByText("11.6f").length).toBeGreaterThanOrEqual(2); // resumo da refeição + rodapé da opção
    expect(screen.queryByText(/Fibra pode estar subestimada/)).toBeNull();
    expect(screen.queryByText("sem dado de fibra")).toBeNull();
  });

  it("alimento sem dado de fibra é avisado em vez de virar zero silencioso", () => {
    render(<Harness initial={payloadWith([item("Arroz parboilizado (cozido)", 150)])} />);
    expect(screen.getByText("sem dado de fibra")).toBeTruthy();
    expect(screen.getByText(/Fibra pode estar subestimada/)).toBeTruthy();
    expect(screen.getByText("0/25*")).toBeTruthy();
  });

  it("carne (zero real) não gera aviso e continua somando as outras fibras", () => {
    render(<Harness initial={payloadWith([item("Feijão carioca (cozido)", 100)], [item("Frango peito s/ pele (grelhado)", 150)])} />);
    expect(screen.getByText("9/25")).toBeTruthy(); // 8,51 g
    expect(screen.queryByText(/Fibra pode estar subestimada/)).toBeNull();
  });

  it("digitar a quantidade reconhece a unidade, mostra a fibra e padroniza o texto ao sair do campo", () => {
    const egg = { name: "Ovo de galinha inteiro (cru)", baseName: "Ovo de galinha inteiro (cru)", weight: "", isTaco: true };
    render(<Harness initial={payloadWith([], [egg])} />);
    const input = screen.getByPlaceholderText(/ex: 150g · 2 uni/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "3 uni" } });
    expect(screen.getByText("3 unidades = 150 g")).toBeTruthy();
    fireEvent.blur(input);
    expect((screen.getByPlaceholderText(/ex: 150g · 2 uni/) as HTMLInputElement).value).toBe("3 unidades");
  });
});
