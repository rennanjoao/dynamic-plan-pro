// src/lib/guidelinesTemplates.ts
//
// Biblioteca de "Templates de Diretrizes" (bloco isolado — só os 4 textos de
// diretrizes: treino, dieta, organização da semana e sono). Mesmo padrão de
// dietTemplates.ts / workoutTemplates.ts: tabela `protocols` discriminada por
// `template_kind = 'guidelines'`.

import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import type { ProtocolPayload } from "@/lib/protocolSchema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const protocolsAny = () => supabase.from("protocols") as any;

export const GuidelinesBlockPayloadSchema = z.object({
  scope: z.literal("guidelines").default("guidelines"),
  guidelines: z.object({
    training: z.string().default(""),
    diet: z.string().default(""),
    weekOrganization: z.string().default(""),
    supplementation: z.string().default(""),
  }).default({} as never),
});

export type GuidelinesBlockPayload = z.infer<typeof GuidelinesBlockPayloadSchema>;

export type GuidelinesTemplate = {
  id: string;
  name: string;
  createdAt: string;
  payload: GuidelinesBlockPayload;
  isSystem: boolean;
};

export function hasAnyGuideline(g: ProtocolPayload["guidelines"] | undefined): boolean {
  if (!g) return false;
  return Object.values(g).some((v) => typeof v === "string" && v.trim().length > 0);
}

/** Lista os templates de diretrizes do coach + os de sistema (coach_id NULL). */
export async function listGuidelinesTemplates(coachId: string | null): Promise<GuidelinesTemplate[]> {
  let query = protocolsAny()
    .select("id, name, payload, created_at, coach_id")
    .eq("is_template", true)
    .eq("template_kind", "guidelines")
    .order("created_at", { ascending: false })
    .limit(150);

  query = coachId
    ? query.or(`coach_id.eq.${coachId},coach_id.is.null`)
    : query.is("coach_id", null);

  const { data, error } = await query;
  if (error) throw error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).flatMap((row: any): GuidelinesTemplate[] => {
    const parsed = GuidelinesBlockPayloadSchema.safeParse(row.payload);
    if (!parsed.success) return [];
    return [{
      id: row.id,
      name: row.name,
      createdAt: row.created_at ?? "",
      payload: parsed.data,
      isSystem: row.coach_id === null,
    }];
  });
}

/** Cria ou atualiza um template de diretrizes. Devolve o id. */
export async function saveGuidelinesAsTemplate(params: {
  coachId: string;
  name: string;
  guidelines: ProtocolPayload["guidelines"];
  existingId?: string | null;
}): Promise<string> {
  const { coachId, existingId } = params;
  if (!coachId) throw new Error("Coach não identificado");
  const trimmed = params.name.trim();
  if (!trimmed) throw new Error("Dê um nome ao template");
  if (!hasAnyGuideline(params.guidelines)) {
    throw new Error("Nenhuma diretriz preenchida para salvar");
  }

  const payload = GuidelinesBlockPayloadSchema.parse({
    scope: "guidelines",
    guidelines: params.guidelines,
  });

  if (existingId) {
    const { error } = await protocolsAny()
      .update({ name: trimmed, payload, updated_at: new Date().toISOString() })
      .eq("id", existingId)
      .eq("coach_id", coachId)
      .eq("template_kind", "guidelines");
    if (error) throw error;
    return existingId;
  }

  const { data, error } = await protocolsAny()
    .insert({
      coach_id: coachId,
      student_id: null,
      name: trimmed,
      is_template: true,
      template_kind: "guidelines",
      payload,
      active: false,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function deleteGuidelinesTemplate(id: string, coachId: string): Promise<void> {
  const { error } = await protocolsAny()
    .delete()
    .eq("id", id)
    .eq("coach_id", coachId)
    .eq("template_kind", "guidelines");
  if (error) throw error;
}

/** Injeta as diretrizes do template no protocolo, sem tocar em nada mais. */
export function injectGuidelines(payload: ProtocolPayload, block: GuidelinesBlockPayload): ProtocolPayload {
  return { ...payload, guidelines: { ...payload.guidelines, ...block.guidelines } };
}
