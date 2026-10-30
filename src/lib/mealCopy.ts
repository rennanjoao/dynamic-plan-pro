// src/lib/mealCopy.ts
//
// Ponto único para transformar uma refeição existente (duplicada, vinda de um
// modelo salvo em `meal_templates`, etc.) numa refeição INDEPENDENTE dentro do
// payload atual. Antes essa limpeza estava copiada em DietTab.attachTemplate e
// DietTab.duplicateMeal, e AUSENTE no "Aplicar" da aba Refeição da biblioteca
// (TemplateLibraryDialog) — que podia trazer `pairId`/`day_type` de outro
// protocolo e criar um par treino/descanso fantasma no aluno.

import { genItemId } from "@/lib/protocolSchema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toIndependentMeal(source: any, opts: { name?: string } = {}): any {
  const meal = JSON.parse(JSON.stringify(source ?? {}));
  // Não pode carregar o vínculo treino/descanso de outra origem.
  delete meal.pairId;
  meal.day_type = "all";
  meal.excludeFromDayTotal = false;
  if (opts.name !== undefined) meal.name = opts.name;
  // __id novo: manter o da origem colidiria no drag-and-drop e na identidade.
  meal.__id = genItemId("meal");
  return meal;
}
