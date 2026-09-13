import type { ProtocolPayload } from "./protocolSchema";
import { calcDayMacros } from "./macroCalc";
import { validatePeriodization } from "./periodizationValidation";

export type PublicationValidation = { errors: string[]; warnings: string[] };

export function validateProtocolForPublication(payload: ProtocolPayload): PublicationValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const macros = payload.macros;
  const values = [macros.calories, macros.protein, macros.carbs, macros.fat, macros.water];
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    errors.push("Revise os macros: há valores inválidos ou negativos.");
  }

  const dayKeys = payload.workouts.map((day) => day.key.trim()).filter(Boolean);
  if (new Set(dayKeys).size !== dayKeys.length) {
    errors.push("Existem blocos de treino com a mesma identificação.");
  }

  const periodization = validatePeriodization(payload);
  if (!periodization.ok) {
    errors.push("Corrija os campos inválidos da periodização antes de publicar.");
  }

  const planned = calcDayMacros(payload.meals);
  if (planned.kcal > 0 && macros.calories > 0) {
    const delta = Math.abs(planned.kcal - macros.calories) / macros.calories;
    if (delta > 0.15) warnings.push("As calorias das refeições diferem mais de 15% da meta diária.");
  }

  return { errors, warnings };
}