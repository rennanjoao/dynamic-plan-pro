// src/lib/dietTemplates.ts
//
// Ponto único de leitura/escrita da biblioteca de "Templates de Dieta"
// (bloco isolado — só refeições, sem treino/macros/suplementos/periodização).
// Espelha exatamente o padrão já estabelecido em workoutTemplates.ts para
// blocos de treino — mesma tabela (`protocols`), discriminada por
// `template_kind = 'diet'`.

import { supabase } from "@/integrations/supabase/client";
import {
  DietBlockPayloadSchema,
  type DietBlockPayload,
  type MealRow,
  genItemId,
} from "@/lib/protocolSchema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const protocolsAny = () => supabase.from("protocols") as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabaseAny = supabase as any;

export type DietBlockTemplate = {
  id: string;
  name: string;
  createdAt: string;
  payload: DietBlockPayload;
  isSystem: boolean;
};

/** Lista os templates de dieta visíveis para o coach: os dele + os de sistema (coach_id NULL). */
export async function listDietBlockTemplates(coachId: string | null): Promise<DietBlockTemplate[]> {
  let query = protocolsAny()
    .select("id, name, payload, created_at, coach_id")
    .eq("is_template", true)
    .eq("template_kind", "diet")
    .order("created_at", { ascending: false })
    .limit(150);

  query = coachId
    ? query.or(`coach_id.eq.${coachId},coach_id.is.null`)
    : query.is("coach_id", null);

  const { data, error } = await query;
  if (error) throw error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).flatMap((row: any): DietBlockTemplate[] => {
    const parsed = DietBlockPayloadSchema.safeParse(row.payload);
    if (!parsed.success) return []; // registro corrompido — não derruba a lista inteira
    return [{
      id: row.id,
      name: row.name,
      createdAt: row.created_at ?? "",
      payload: parsed.data,
      isSystem: row.coach_id === null,
    }];
  });
}

/**
 * Salva (cria ou atualiza) a dieta atual como template via RPC atômica
 * (snapshot da versão anterior + escrita, numa só transação).
 */
export async function saveDietBlockAsTemplate(params: {
  coachId: string;
  name: string;
  meals: MealRow[];
  existingId?: string | null;
}): Promise<string> {
  const { coachId, existingId } = params;
  if (!coachId) throw new Error("Coach não identificado");
  const trimmed = params.name.trim();
  if (!trimmed) throw new Error("Dê um nome ao template");
  if (params.meals.length === 0) {
    throw new Error("Nenhuma refeição para salvar — monte a dieta primeiro");
  }

  const payload = DietBlockPayloadSchema.parse({
    scope: "diet",
    meals: params.meals,
  });

  const { data, error } = await supabaseAny.rpc("save_diet_block_template", {
    p_template_id: existingId ?? null,
    p_coach_id: coachId,
    p_name: trimmed,
    p_payload: payload,
  });
  if (error) throw error;
  return data as string;
}

export async function deleteDietBlockTemplate(id: string, coachId: string): Promise<void> {
  const { error } = await protocolsAny()
    .delete()
    .eq("id", id)
    .eq("coach_id", coachId)
    .eq("template_kind", "diet");
  if (error) throw error;
}

export type DietBlockVersion = {
  id: string;
  version: number;
  payload: DietBlockPayload;
  createdAt: string;
};

export async function listDietBlockVersions(templateId: string): Promise<DietBlockVersion[]> {
  const { data, error } = await supabaseAny.from("diet_block_versions")
    .select("id, version, payload, created_at")
    .eq("template_id", templateId)
    .order("version", { ascending: false });
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).flatMap((row: any): DietBlockVersion[] => {
    const parsed = DietBlockPayloadSchema.safeParse(row.payload);
    if (!parsed.success) return [];
    return [{ id: row.id, version: row.version, payload: parsed.data, createdAt: row.created_at }];
  });
}

/** Restaura uma versão antiga como o payload ATUAL do template (mantém o nome). */
export async function restoreDietBlockVersion(
  templateId: string,
  coachId: string,
  templateName: string,
  version: DietBlockVersion,
): Promise<void> {
  await saveDietBlockAsTemplate({
    coachId,
    name: templateName,
    meals: version.payload.meals,
    existingId: templateId,
  });
}

/**
 * Substitui a lista de refeições do payload ATUAL do protocolo pelas do
 * template, sem tocar em mais nada (treino, macros, suplementos,
 * periodização, diretrizes seguem intactos). Gera `__id` novo pra cada
 * refeição — mesmo cuidado já tomado no anexo de refeição individual
 * (DietTab.tsx), pra não colidir com ids de refeições já existentes.
 */
export function injectDietBlock<T extends { meals: MealRow[] }>(
  payload: T,
  tpl: DietBlockPayload,
): T {
  if (tpl.meals.length === 0) return payload;
  const meals = tpl.meals.map((m) => ({ ...m, __id: genItemId("meal") }));
  return { ...payload, meals };
}

