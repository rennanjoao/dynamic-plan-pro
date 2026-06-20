/**
 * shoppingListAgg.ts
 *
 * Funções de agregação para a Lista de Compras.
 * Lê meals[].options[].items[], normaliza nomes, soma quantidades
 * e retorna AggItem[] agrupados por kind.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AggItem {
  name: string;
  kind: string;
  /** Total em gramas (ou unidades quando isCount=true) para 1 dia */
  total: number;
  /** true quando o item é contável (unidades), não pesável */
  isCount: boolean;
  unit: string;
  gramsPerDay: number;
}

// ─── HTML helpers ─────────────────────────────────────────────────────────────

export function stripHtml(str: string): string {
  if (!str) return "";
  return str
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
}

// ─── Name normalisation ───────────────────────────────────────────────────────

export function normalizeName(raw: string): string {
  if (!raw) return "";
  return stripHtml(raw).toLowerCase().trim();
}

// ─── Weight parsing ───────────────────────────────────────────────────────────

/**
 * Retorna gramas a partir de um item de protocolo.
 * Prioridade: item.rawWeight (TACO) > parse de item.weight (string).
 */
export function parseGrams(item: any): number {
  if (!item) return 0;

  // TACO rawWeight tem prioridade
  if (typeof item.rawWeight === "number" && item.rawWeight > 0) {
    return item.rawWeight;
  }

  const raw: string = String(item.weight ?? "").trim().replace(",", ".");
  if (!raw) return 0;

  const match = raw.match(/^([\d.]+)\s*(g|kg|ml|l)$/i);
  if (!match) return 0;

  const value = parseFloat(match[1]);
  const unit = match[2].toLowerCase();

  if (unit === "kg") return value * 1000;
  if (unit === "l") return value * 1000;
  return value; // g ou ml — 1:1
}

// ─── Quantity formatting ──────────────────────────────────────────────────────

export function formatQty(grams: number): string {
  const rounded = Math.round(grams);
  if (rounded < 1000) return `${rounded} g`;
  const kg = grams / 1000;
  if (Number.isInteger(kg) || kg % 1 === 0) return `${kg} kg`;
  return `${kg.toFixed(2)} kg`;
}

export function formatAggItem(item: Pick<AggItem, "total" | "isCount" | "unit">): string {
  if (item.isCount) return `${Math.round(item.total)} ${item.unit}`;
  return formatQty(item.total);
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

/**
 * Agrega itens de todas as refeições numa lista de compras.
 *
 * @param meals           Array de refeições do protocolo (meals[].options[].items[])
 * @param selectedOptions Mapa de `${mealIdx}:${kind}` → índice da opção selecionada
 */
export function aggregateShoppingList(
  meals: any[],
  selectedOptions: Record<string, number> = {},
): AggItem[] {
  if (!Array.isArray(meals) || meals.length === 0) return [];

  // key: `${normalizedName}|${kind}` → acumulador
  const acc: Record<string, { name: string; kind: string; grams: number }> = {};

  meals.forEach((meal, mi) => {
    const opts: any[] = Array.isArray(meal.options) ? meal.options : [];

    // Agrupa opções por kind
    const byKind: Record<string, any[]> = {};
    opts.forEach((o) => {
      const k = o?.kind || "other";
      (byKind[k] ||= []).push(o);
    });

    Object.entries(byKind).forEach(([kind, options]) => {
      const selKey = `${mi}:${kind}`;
      const selIdx = selectedOptions[selKey] ?? 0;
      const chosen = options[Math.min(selIdx, options.length - 1)];
      if (!chosen) return;

      const items: any[] = Array.isArray(chosen.items) ? chosen.items : [];
      items.forEach((item) => {
        const grams = parseGrams(item);
        if (grams === 0) return;

        const rawName = item.baseName || item.name || "";
        const name = stripHtml(rawName).trim();
        if (!name) return;

        const normKey = `${normalizeName(rawName)}|${kind}`;
        if (!acc[normKey]) {
          acc[normKey] = { name, kind, grams: 0 };
        }
        acc[normKey].grams += grams;
      });
    });
  });

  return Object.values(acc).map(({ name, kind, grams }) => ({
    name,
    kind,
    total: grams,
    gramsPerDay: grams,
    isCount: false,
    unit: "g",
  }));
}
