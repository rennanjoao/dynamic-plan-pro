// Fecha a conta do rascunho de protocolo gerado por IA.
// A IA sugere números, mas modelo de linguagem erra aritmética: aqui a conta é feita por fórmula.
// Regra (mesma do coach): as CALORIAS são a meta; proteína e gordura ficam como a IA sugeriu
// (já limitadas por faixa), e o CARBOIDRATO fecha o que sobra. kcal = 4·P + 4·C + 9·G.
// Depois, as refeições são reescaladas para somar exatamente os totais do dia.

export interface DraftMeal {
  nome: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  sugestao: string;
}

export interface DraftTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  rationale: string;
  meals: DraftMeal[];
}

const kcalOf = (p: number, c: number, g: number) => Math.round(4 * p + 4 * c + 9 * g);

/** Reparte `target` entre `values` proporcionalmente, com inteiros que somam exatamente `target`. */
function scaleToTotal(values: number[], target: number): number[] {
  const sum = values.reduce((a, b) => a + b, 0);
  if (sum <= 0 || target < 0) return values;
  const scaled = values.map((v) => Math.round((v * target) / sum));
  const drift = target - scaled.reduce((a, b) => a + b, 0);
  if (drift !== 0) {
    let idx = 0;
    for (let i = 1; i < values.length; i++) if (values[i] > values[idx]) idx = i;
    scaled[idx] += drift;
  }
  return scaled;
}

export function reconcileDraft<T extends DraftTotals>(draft: T): T {
  const notes: string[] = [];
  const protein = draft.protein;
  const fat = draft.fat;
  const calories = draft.calories;

  const carbsFromKcal = Math.max(0, Math.round((calories - 4 * protein - 9 * fat) / 4));
  if (Math.abs(carbsFromKcal - draft.carbs) > 10) {
    notes.push(`carboidrato ajustado de ${draft.carbs} g para ${carbsFromKcal} g para fechar as calorias`);
  }
  const carbs = carbsFromKcal;
  const closedKcal = kcalOf(protein, carbs, fat);

  let meals = draft.meals;
  const hasMeals = meals.length > 0 && meals.some((m) => m.protein + m.carbs + m.fat > 0);
  if (hasMeals) {
    const p = scaleToTotal(meals.map((m) => m.protein), protein);
    const c = scaleToTotal(meals.map((m) => m.carbs), carbs);
    const g = scaleToTotal(meals.map((m) => m.fat), fat);
    const changed = meals.some((m, i) => m.protein !== p[i] || m.carbs !== c[i] || m.fat !== g[i]);
    if (changed) notes.push("refeições reescaladas para somar os totais do dia");
    meals = meals.map((m, i) => ({ ...m, protein: p[i], carbs: c[i], fat: g[i], kcal: kcalOf(p[i], c[i], g[i]) }));
  }

  return {
    ...draft,
    carbs,
    calories: closedKcal,
    meals,
    rationale: notes.length
      ? `${draft.rationale} (Conferência automática: ${notes.join("; ")}.)`
      : draft.rationale,
  };
}
