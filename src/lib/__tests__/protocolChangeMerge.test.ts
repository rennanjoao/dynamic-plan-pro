import { describe, it, expect } from "vitest";
import { mergeProtocolChanges } from "../protocolChangeMerge";
import type { ProtocolChange } from "../protocolChangeDetector";

const mk = (
  overrides: Partial<ProtocolChange> & { label: string }
): ProtocolChange => ({
  category: "dieta",
  importance: "baixa",
  target_tab: "dieta",
  target_anchor: null,
  detail: null,
  ...overrides,
});

describe("mergeProtocolChanges", () => {
  it("mesma refeição/mesmo alimento em saves consecutivos → mantém o detail mais recente na posição original", () => {
    const existing: ProtocolChange[] = [
      mk({
        label: "A quantidade de Pão Integral na refeição Café da manhã foi ajustada",
        target_anchor: "meal-cafe-da-manha-carb-opcao-1-item-pao-integral",
        detail: "60g → 80g",
      }),
      mk({
        label: "Outra mudança qualquer",
        target_anchor: "meal-almoco-item-arroz",
        detail: "primeira",
      }),
    ];
    const incoming: ProtocolChange[] = [
      mk({
        label: "A quantidade de Pão Integral na refeição Café da manhã foi ajustada",
        target_anchor: "meal-cafe-da-manha-carb-opcao-1-item-pao-integral",
        detail: "80g → 100g",
      }),
    ];
    const merged = mergeProtocolChanges(existing, incoming);
    expect(merged).toHaveLength(2);
    // Item substituído na posição 0, com o detail novo
    expect(merged[0].detail).toBe("80g → 100g");
    expect(merged[0].target_anchor).toBe("meal-cafe-da-manha-carb-opcao-1-item-pao-integral");
    // Segundo item intacto
    expect(merged[1].detail).toBe("primeira");
  });

  it("15 existentes + 10 novos → colapsa em um único evento 'geral'", () => {
    const existing: ProtocolChange[] = Array.from({ length: 15 }, (_, i) =>
      mk({ label: `existente ${i}`, target_anchor: `anchor-e-${i}` })
    );
    const incoming: ProtocolChange[] = Array.from({ length: 10 }, (_, i) =>
      mk({ label: `novo ${i}`, target_anchor: `anchor-n-${i}` })
    );
    const merged = mergeProtocolChanges(existing, incoming);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      category: "geral",
      importance: "alta",
      label: "Seu protocolo foi totalmente atualizado pelo seu coach",
      target_anchor: null,
    });
  });

  it("existente já é o evento único 'geral' → mantém como está mesmo com incoming", () => {
    const existing: ProtocolChange[] = [
      {
        category: "geral",
        importance: "alta",
        label: "Seu protocolo foi totalmente atualizado pelo seu coach",
        target_tab: null,
        target_anchor: null,
        detail: null,
      },
    ];
    const incoming: ProtocolChange[] = [mk({ label: "algo novo", target_anchor: "x" })];
    expect(mergeProtocolChanges(existing, incoming)).toEqual(existing);
  });

  it("itens novos sem colisão são anexados ao final", () => {
    const existing: ProtocolChange[] = [mk({ label: "a", target_anchor: "x" })];
    const incoming: ProtocolChange[] = [mk({ label: "b", target_anchor: "y" })];
    const merged = mergeProtocolChanges(existing, incoming);
    expect(merged.map((c) => c.target_anchor)).toEqual(["x", "y"]);
  });

  it("dedup por label quando target_anchor é null (fallback para eventos 'geral')", () => {
    const existing: ProtocolChange[] = [
      mk({ label: "Seu objetivo foi atualizado", target_anchor: null, detail: "antigo" }),
    ];
    const incoming: ProtocolChange[] = [
      mk({ label: "Seu objetivo foi atualizado", target_anchor: null, detail: "novo" }),
    ];
    const merged = mergeProtocolChanges(existing, incoming);
    expect(merged).toHaveLength(1);
    expect(merged[0].detail).toBe("novo");
  });
});