/**
 * protocolImportValidator.ts
 *
 * Validation Layer para importação de JSON de protocolos.
 *
 * Responsabilidades:
 *  1) Smart Mapping estrito: garante que opções com `kind: "carb"` cheguem
 *     no array/coluna de carboidratos da UI, "protein" em proteínas, "fat"
 *     em gorduras. Nunca embaralha — opções sem kind reconhecido viram
 *     anomalia (orphan) em vez de cair como "carb" silenciosamente.
 *
 *  2) Detecção de Ciclagem (carbCycle): lê tanto `payload.carbCycle` (mapa
 *     dia→intensidade) quanto `payload.setup.carbCycle` (boolean) e ativa
 *     o toggle. Também injeta multiplicadores padrão (`carbCycleHighPct` /
 *     `carbCycleLowPct`) quando ausentes.
 *
 *  3) Sistema de Catch (anomalias): retorna lista de orphan data com
 *     contexto (refeição, opção, índice, motivo) para alimentar o Modal
 *     de Resolução. Anomalias possíveis:
 *       - option-missing-kind   → opção sem kind reconhecido
 *       - option-empty-items    → opção sem nenhum item válido
 *       - item-broken           → item com nome vazio/quebrado
 *       - workout-broken        → exercício sem nome
 */

import type { ProtocolPayload } from "./protocolSchema";

export type AnomalyKind =
  | "option-missing-kind"
  | "option-empty-items"
  | "item-broken"
  | "workout-broken";

export interface ImportAnomaly {
  id: string;
  kind: AnomalyKind;
  reason: string;
  // Coordenadas para fazer o link manual depois
  mealIndex?: number;
  optionIndex?: number;
  itemIndex?: number;
  workoutIndex?: number;
  exerciseIndex?: number;
  // Snapshot do valor problemático
  rawValue?: any;
  // Sugestão (kind inferível, etc.)
  suggestedKind?: "carb" | "protein" | "fat";
}

export interface ValidationResult {
  payload: ProtocolPayload;
  anomalies: ImportAnomaly[];
  cycleActivated: boolean;
}

const VALID_KINDS = new Set(["carb", "protein", "fat"]);

function normalizeKind(raw: any): "carb" | "protein" | "fat" | null {
  if (typeof raw !== "string") return null;
  const s = raw.toLowerCase().trim();
  if (s === "carb" || s === "carbs" || s === "carbo" || s === "carboidrato") return "carb";
  if (s === "protein" || s === "proteina" || s === "proteína" || s === "prot") return "protein";
  if (s === "fat" || s === "gordura" || s === "lipid" || s === "lipídio") return "fat";
  return null;
}

function hasName(it: any): boolean {
  const n = (it?.name ?? it?.baseName ?? "").toString().trim();
  return n.length > 0;
}

/**
 * Aplica o roteamento inteligente + coleta anomalias.
 * NÃO muta o input — devolve cópia segura.
 */
export function validateAndMapImport(input: any): ValidationResult {
  const anomalies: ImportAnomaly[] = [];
  const payload: any = { ...(input || {}) };

  // ─── 1) Carb Cycle: detecta e ativa ───────────────────────────────────────
  const carbCycleMap = payload.carbCycle && typeof payload.carbCycle === "object" && !Array.isArray(payload.carbCycle)
    ? payload.carbCycle
    : null;
  const setupFlag = !!payload?.setup?.carbCycle;
  const cycleActivated = setupFlag || (carbCycleMap && Object.keys(carbCycleMap).length > 0);

  if (cycleActivated) {
    payload.setup = { ...(payload.setup || {}), carbCycle: true };
    if (typeof payload.carbCycleHighPct !== "number") payload.carbCycleHighPct = 15;
    if (typeof payload.carbCycleLowPct !== "number") payload.carbCycleLowPct = 15;
    if (!payload.carbCycle || typeof payload.carbCycle !== "object") {
      payload.carbCycle = {};
    }
  }

  // ─── 2) Smart mapping estrito por kind + catch de anomalias ───────────────
  payload.meals = (Array.isArray(payload.meals) ? payload.meals : []).map((meal: any, mealIndex: number) => {
    const options = (Array.isArray(meal?.options) ? meal.options : []).map((opt: any, optionIndex: number) => {
      const normalized = normalizeKind(opt?.kind);

      if (!normalized) {
        anomalies.push({
          id: `opt-${mealIndex}-${optionIndex}`,
          kind: "option-missing-kind",
          reason: `Opção "${opt?.title || "sem título"}" da refeição "${meal?.name || mealIndex + 1}" sem categoria reconhecida (kind="${opt?.kind ?? "—"}").`,
          mealIndex,
          optionIndex,
          rawValue: opt,
        });
      }

      const items = (Array.isArray(opt?.items) ? opt.items : []).map((it: any, itemIndex: number) => {
        if (!hasName(it)) {
          anomalies.push({
            id: `item-${mealIndex}-${optionIndex}-${itemIndex}`,
            kind: "item-broken",
            reason: `Item sem nome em "${meal?.name || mealIndex + 1}" / opção ${optionIndex + 1}.`,
            mealIndex,
            optionIndex,
            itemIndex,
            rawValue: it,
          });
        }
        return it;
      });

      const validItemsCount = items.filter(hasName).length;
      if (opt && validItemsCount === 0 && (Array.isArray(opt?.items) ? opt.items.length : 0) > 0) {
        anomalies.push({
          id: `opt-empty-${mealIndex}-${optionIndex}`,
          kind: "option-empty-items",
          reason: `Opção "${opt?.title || optionIndex + 1}" da refeição "${meal?.name || mealIndex + 1}" não tem nenhum item válido.`,
          mealIndex,
          optionIndex,
          rawValue: opt,
        });
      }

      // Preserva kind original (mesmo inválido) — o modal vai corrigir.
      return { ...opt, kind: normalized ?? opt?.kind ?? "carb", items };
    });
    return { ...meal, options };
  });

  // ─── 3) Workouts (orphan check leve) ──────────────────────────────────────
  payload.workouts = (Array.isArray(payload.workouts) ? payload.workouts : []).map((w: any, workoutIndex: number) => {
    const exercises = (Array.isArray(w?.exercises) ? w.exercises : []).map((ex: any, exerciseIndex: number) => {
      const name = (ex?.name ?? "").toString().trim();
      if (!name) {
        anomalies.push({
          id: `wk-${workoutIndex}-${exerciseIndex}`,
          kind: "workout-broken",
          reason: `Exercício sem nome no treino "${w?.key || workoutIndex + 1}".`,
          workoutIndex,
          exerciseIndex,
          rawValue: ex,
        });
      }
      return ex;
    });
    return { ...w, exercises };
  });

  return { payload: payload as ProtocolPayload, anomalies, cycleActivated };
}

/**
 * Aplica resoluções manuais vindas do Modal sobre o payload.
 * `resolutions` é um map id-da-anomalia → ação.
 */
export type Resolution =
  | { type: "set-kind"; kind: "carb" | "protein" | "fat" }
  | { type: "rename-item"; name: string }
  | { type: "discard" };

export function applyResolutions(
  payload: ProtocolPayload,
  anomalies: ImportAnomaly[],
  resolutions: Record<string, Resolution>
): ProtocolPayload {
  const out: any = JSON.parse(JSON.stringify(payload));

  // ordena descarte de items de trás pra frente para não invalidar índices
  const discardItemOps: ImportAnomaly[] = [];
  const discardOptionOps: ImportAnomaly[] = [];
  const discardExerciseOps: ImportAnomaly[] = [];

  for (const a of anomalies) {
    const r = resolutions[a.id];
    if (!r) continue;

    if (a.kind === "option-missing-kind" && a.mealIndex != null && a.optionIndex != null) {
      if (r.type === "set-kind") {
        out.meals[a.mealIndex].options[a.optionIndex].kind = r.kind;
      } else if (r.type === "discard") {
        discardOptionOps.push(a);
      }
    }

    if (a.kind === "item-broken" && a.mealIndex != null && a.optionIndex != null && a.itemIndex != null) {
      if (r.type === "rename-item") {
        out.meals[a.mealIndex].options[a.optionIndex].items[a.itemIndex].name = r.name;
        out.meals[a.mealIndex].options[a.optionIndex].items[a.itemIndex].baseName = r.name;
      } else if (r.type === "discard") {
        discardItemOps.push(a);
      }
    }

    if (a.kind === "option-empty-items" && a.mealIndex != null && a.optionIndex != null) {
      if (r.type === "discard") discardOptionOps.push(a);
    }

    if (a.kind === "workout-broken" && a.workoutIndex != null && a.exerciseIndex != null) {
      if (r.type === "rename-item") {
        out.workouts[a.workoutIndex].exercises[a.exerciseIndex].name = r.name;
      } else if (r.type === "discard") {
        discardExerciseOps.push(a);
      }
    }
  }

  // Discards: ordem reversa por índice
  discardItemOps
    .sort((a, b) => (b.itemIndex! - a.itemIndex!))
    .forEach((a) => out.meals[a.mealIndex!].options[a.optionIndex!].items.splice(a.itemIndex!, 1));

  discardOptionOps
    .sort((a, b) => (b.optionIndex! - a.optionIndex!))
    .forEach((a) => out.meals[a.mealIndex!].options.splice(a.optionIndex!, 1));

  discardExerciseOps
    .sort((a, b) => (b.exerciseIndex! - a.exerciseIndex!))
    .forEach((a) => out.workouts[a.workoutIndex!].exercises.splice(a.exerciseIndex!, 1));

  return out as ProtocolPayload;
}