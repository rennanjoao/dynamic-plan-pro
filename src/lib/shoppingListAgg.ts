/**
 * shoppingListAgg.ts
 * Helpers puros para agregação da Lista de Compras — extraídos para testes.
 *
 * CORREÇÕES:
 * 1. parseGrams agora preserva unidades (un, fatia, ovo, etc.) em vez de
 *    converter tudo para gramas quando não existe rawWeight.
 * 2. Itens com item.optional === true são ignorados (não entram na lista).
 * 3. AggItem recebe campo `unit` para exibição fiel da unidade original.
 */

export type AggItem = {
  name: string;
  kind: string;
  /** Quantidade total acumulada (gramas ou unidades/ml conforme `unit`) */
  total: number;
  /** Unidade de exibição: "g" | "kg" | "ml" | "l" | "un" | string */
  unit: string;
  /** true se a unidade é contável (un, fatia, ovo…) — não converte para g */
  isCount: boolean;
};

export function stripHtml(s: string): string {
  return (s || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

/** Regex de unidades contáveis */
const COUNT_REGEX = /\b(un|unid(?:ade)?s?|fatia|fatias|ovo|ovos|colher(?:es)?|copo|copos|porc[ãa]o|por[çc][ãa]o|pe[çc]a|pe[çc]as)\b/i;
const MASS_REGEX  = /(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l)\b/i;

/**
 * Analisa o campo weight/rawWeight de um item e retorna { total, unit, isCount }.
 * rawWeight (número interno em gramas) só é usado para itens g/ml genuínos,
 * mas NÃO sobrescreve exibição de "unidades".
 */
export function parseItemQty(it: any): { total: number; unit: string; isCount: boolean } | null {
  // 1. Tenta ler a representação textual original primeiro (preserva "unidades")
  const txt = stripHtml(it?.weight || "");

  if (txt) {
    // Unidade contável?
    if (COUNT_REGEX.test(txt)) {
      const v = parseFloat(txt.replace(/[^\d.,]/g, "").replace(",", ".")) || 0;
      if (v <= 0) return null;
      const matchedUnit = (txt.match(COUNT_REGEX)?.[1] || "un").toLowerCase();
      const unit = matchedUnit.startsWith("un") ? "un"
        : matchedUnit.startsWith("fatia") ? "fatia(s)"
        : matchedUnit.startsWith("ovo") ? "un"
        : matchedUnit.startsWith("colher") ? "colher(es)"
        : matchedUnit.startsWith("copo") ? "copo(s)"
        : "un";
      return { total: v, unit, isCount: true };
    }

    // ml / litro?
    const mMass = txt.match(MASS_REGEX);
    if (mMass) {
      let v = Number(mMass[1].replace(",", "."));
      const u = mMass[2].toLowerCase();
      if (u === "kg" || u === "l") { v *= 1000; }
      const displayUnit = (u === "kg" || u === "g") ? "g" : "ml";
      if (v <= 0) return null;
      return { total: v, unit: displayUnit, isCount: false };
    }
  }

  // 2. Fallback: rawWeight numérico (gramas internas para TACO)
  if (typeof it?.rawWeight === "number" && it.rawWeight > 0) {
    return { total: it.rawWeight, unit: "g", isCount: false };
  }

  return null;
}

/** @deprecated use parseItemQty — mantido para compatibilidade com testes existentes */
export function parseGrams(it: any): number {
  if (typeof it?.rawWeight === "number" && it.rawWeight > 0) return it.rawWeight;
  const txt = stripHtml(it?.weight || "");
  const m = txt.match(/(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l)?/i);
  if (!m) return 0;
  let v = Number(m[1].replace(",", "."));
  const unit = (m[2] || "").toLowerCase();
  if (unit === "kg" || unit === "l") v *= 1000;
  return v;
}

export function normalizeName(name: string): string {
  return stripHtml(name).toLowerCase().trim();
}

export function formatQty(total: number, unit: string, isCount: boolean): string {
  if (isCount) {
    return `${Math.round(total)} ${unit}`;
  }
  // massa/volume em g ou ml
  if (unit === "g") {
    return total >= 1000
      ? `${(total / 1000).toFixed(total % 1000 === 0 ? 0 : 2)} kg`
      : `${Math.round(total)} g`;
  }
  if (unit === "ml") {
    return total >= 1000
      ? `${(total / 1000).toFixed(total % 1000 === 0 ? 0 : 2)} l`
      : `${Math.round(total)} ml`;
  }
  return `${Math.round(total)} ${unit}`;
}

/**
 * Agrega itens das opções selecionadas em uma lista única.
 * @param meals  payload.meals do protocolo
 * @param selected  map "<mealIdx>:<kind>" -> opção escolhida (default 0)
 */
export function aggregateShoppingList(
  meals: any[],
  selected: Record<string, number> = {}
): AggItem[] {
  const map = new Map<string, AggItem>();

  meals.forEach((meal, mi) => {
    const opts: any[] = Array.isArray(meal?.options) ? meal.options : [];
    const byKind: Record<string, any[]> = {};
    opts.forEach((o) => {
      const k = o?.kind || "other";
      (byKind[k] ||= []).push(o);
    });

    Object.entries(byKind).forEach(([kind, list]) => {
      const idx = selected[`${mi}:${kind}`] ?? 0;
      const chosen = list[idx] || list[0];
      const items: any[] = Array.isArray(chosen?.items) ? chosen.items : [];

      items.forEach((it) => {
        // CORREÇÃO 2: ignora itens opcionais (não entram nos macros nem na lista)
        if (it?.optional === true) return;

        const name = stripHtml(it?.baseName || it?.name || "");
        if (!name) return;

        const qty = parseItemQty(it);
        if (!qty || qty.total <= 0) return;

        const key = `${normalizeName(name)}::${qty.unit}`;
        const existing = map.get(key);
        if (existing) {
          existing.total += qty.total;
        } else {
          map.set(key, {
            name,
            kind,
            total: qty.total,
            unit: qty.unit,
            isCount: qty.isCount,
          });
        }
      });
    });
  });

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Formata um AggItem para exibição na lista de compras.
 * Substitui o antigo formatQty(grams) de chamada externa.
 */
export function formatAggItem(item: AggItem): string {
  return formatQty(item.total, item.unit, item.isCount);
}
