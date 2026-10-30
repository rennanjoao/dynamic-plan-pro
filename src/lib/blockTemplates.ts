// src/lib/blockTemplates.ts
//
// Ponto único de leitura/exclusão/histórico dos templates de BLOCO
// (treino, dieta, periodização, diretrizes). Todos moram na tabela
// `protocols` (is_template = true) discriminados por `template_kind`, e
// antes cada um tinha a sua própria cópia de list/delete/versions/restore
// (workoutTemplates, dietTemplates, periodizationTemplates e
// guidelinesTemplates). As quatro cópias divergiam sutilmente — ex.:
// diretrizes gravava com UPDATE/INSERT direto (sem snapshot de versão e com
// `student_id: null`), enquanto os outros três usam RPC atômica com
// `student_id = coach_id`. Centralizar aqui impede que a divergência volte.
//
// Cada módulo de domínio continua dono do que é realmente específico dele:
// o schema do payload, a validação pré-save e a função `inject*`.

import { supabase } from "@/integrations/supabase/client";
import type { ZodType } from "zod";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const protocolsAny = () => supabase.from("protocols") as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabaseAny = supabase as any;

export type BlockTemplateKind = "workout" | "diet" | "periodization" | "guidelines";

export type BlockTemplate<P> = {
  id: string;
  name: string;
  createdAt: string;
  payload: P;
  /** true quando coach_id IS NULL (template de referência do sistema). */
  isSystem: boolean;
};

export type BlockVersion<P> = {
  id: string;
  version: number;
  payload: P;
  createdAt: string;
};

type Config<P, X extends object> = {
  kind: BlockTemplateKind;
  schema: ZodType<P>;
  /** Tabela de histórico (`<kind>_block_versions`). Omitir se o kind ainda não tem. */
  versionsTable?: string;
  /** RPC atômica de create/update + snapshot de versão. */
  saveRpc?: string;
  /** Colunas extras a selecionar além das básicas (ex.: divisão/perfil do treino). */
  extraSelect?: string;
  /** Mapeia as colunas extras para campos do template. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mapExtra?: (row: any) => X;
};

export function createBlockTemplateStore<P, X extends object = Record<never, never>>(
  cfg: Config<P, X>,
) {
  const select = ["id", "name", "payload", "created_at", "coach_id", cfg.extraSelect]
    .filter(Boolean)
    .join(", ");

  /** Templates visíveis para o coach: os dele + os de sistema (coach_id NULL). */
  async function list(coachId: string | null): Promise<Array<BlockTemplate<P> & X>> {
    let query = protocolsAny()
      .select(select)
      .eq("is_template", true)
      .eq("template_kind", cfg.kind)
      .order("created_at", { ascending: false })
      .limit(150);

    query = coachId
      ? query.or(`coach_id.eq.${coachId},coach_id.is.null`)
      : query.is("coach_id", null);

    const { data, error } = await query;
    if (error) throw error;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data ?? []).flatMap((row: any): Array<BlockTemplate<P> & X> => {
      const parsed = cfg.schema.safeParse(row.payload);
      if (!parsed.success) return []; // registro corrompido — não derruba a lista inteira
      return [{
        id: row.id,
        name: row.name,
        createdAt: row.created_at ?? "",
        payload: parsed.data,
        isSystem: row.coach_id === null,
        ...((cfg.mapExtra ? cfg.mapExtra(row) : {}) as X),
      }];
    });
  }

  async function remove(id: string, coachId: string): Promise<void> {
    const { error } = await protocolsAny()
      .delete()
      .eq("id", id)
      .eq("coach_id", coachId)
      .eq("template_kind", cfg.kind);
    if (error) throw error;
  }

  /** Cria/atualiza via RPC atômica (snapshot da versão anterior + escrita). Devolve o id. */
  async function saveViaRpc(params: {
    coachId: string;
    name: string;
    payload: P;
    existingId?: string | null;
  }): Promise<string> {
    if (!cfg.saveRpc) throw new Error(`Template "${cfg.kind}" não tem RPC de salvamento`);
    const { data, error } = await supabaseAny.rpc(cfg.saveRpc, {
      p_template_id: params.existingId ?? null,
      p_coach_id: params.coachId,
      p_name: params.name,
      p_payload: params.payload,
    });
    if (error) throw error;
    return data as string;
  }

  async function listVersions(templateId: string): Promise<Array<BlockVersion<P>>> {
    if (!cfg.versionsTable) return [];
    const { data, error } = await supabaseAny.from(cfg.versionsTable)
      .select("id, version, payload, created_at")
      .eq("template_id", templateId)
      .order("version", { ascending: false });
    if (error) throw error;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data ?? []).flatMap((row: any): Array<BlockVersion<P>> => {
      const parsed = cfg.schema.safeParse(row.payload);
      if (!parsed.success) return [];
      return [{ id: row.id, version: row.version, payload: parsed.data, createdAt: row.created_at }];
    });
  }

  return { list, remove, saveViaRpc, listVersions };
}

/** Validação comum a todos os saves de template (coach + nome). Devolve o nome já aparado. */
export function assertTemplateIdentity(coachId: string | null | undefined, name: string): string {
  if (!coachId) throw new Error("Coach não identificado");
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Dê um nome ao template");
  return trimmed;
}
