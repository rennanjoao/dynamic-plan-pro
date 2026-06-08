/**
 * shoppingListAgg.ts
 * Helpers puros para agregação da Lista de Compras — extraídos para testes.
 */

export type AggItem = { name: string; kind: string; gramsPerDay: number };

export function stripHtml(s: string): string {
  return (s || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

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

export function formatQty(grams: number): string {
  if (grams >= 1000) return `${(grams / 1000).toFixed(grams % 1000 === 0 ? 0 : 2)} kg`;
  return `${Math.round(grams)} g`;
}

/**
 * Agrega itens das opções selecionadas em uma lista única.
 * @param meals payload.meals do protocolo
 * @param selected map "<mealIdx>:<kind>" -> opcao escolhida (default 0)
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
        const name = stripHtml(it?.baseName || it?.name || "");
        if (!name) return;
        const grams = parseGrams(it);
        if (!grams) return;
        const key = normalizeName(name);
        const existing = map.get(key);
        if (existing) existing.gramsPerDay += grams;
        else map.set(key, { name, kind, gramsPerDay: grams });
      });
    });
  });
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}