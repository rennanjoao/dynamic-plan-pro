// src/lib/protocolBulkCopy.ts
//
// Copiar um protocolo (o atual ou um modelo da biblioteca) para VÁRIOS alunos
// de uma vez, como rascunho individual de cada um (auditoria de 21/11/2026,
// Pacote C). Mesma regra que o "Copiar para outro aluno" já usava, agora para
// N alunos:
//  - aluno COM protocolo: as seções marcadas entram no RASCUNHO dele
//    (protocol_drafts, via save_protocol_with_plan com p_as_draft) — o
//    publicado e as seções não marcadas ficam intactos;
//  - aluno SEM protocolo: cria um protocolo INATIVO (o aluno não vê nada).
// Nada chega a nenhum aluno até o coach abrir, revisar e publicar.

import { sb } from "@/integrations/supabase/untyped";
import { ProtocolPayloadSchema } from "@/lib/protocolSchema";
import { buildSaveProtocolArgs } from "@/lib/protocolSave";
import { blankProtocolPayload, copyProtocolSections, type CopySection } from "@/lib/protocolCopy";

type Row = Record<string, unknown>;
// Cliente mínimo (o `sb` do app ou um mock de teste).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = { from: (t: string) => any; rpc: (fn: string, args: Row) => any };

export interface BulkTarget { id: string; name: string }

export interface BulkTargetPlan extends BulkTarget {
  protocol: { id: string; payload: Row; revision: number; name: string; active: boolean | null } | null;
  /** Rascunho ainda não publicado — as seções marcadas dele serão substituídas. */
  draftPayload: Row | null;
}

export type BulkResult = { id: string; name: string; ok: true; mode: "draft" | "created" } | { id: string; name: string; ok: false; error: string };

/** Busca o protocolo mais recente e o rascunho (se houver) de cada aluno de destino. */
export async function planBulkCopy(targets: BulkTarget[], client: Client = sb): Promise<BulkTargetPlan[]> {
  const ids = targets.map((t) => t.id);
  if (ids.length === 0) return [];
  const { data: protos, error } = await client
    .from("protocols")
    .select("id, student_id, payload, revision, name, active, updated_at")
    .in("student_id", ids)
    .eq("is_template", false)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  const latest = new Map<string, Row>();
  for (const p of (protos ?? []) as Row[]) {
    const sid = String(p.student_id);
    if (!latest.has(sid)) latest.set(sid, p); // o mais recente, como o construtor carrega
  }
  const protoIds = [...latest.values()].map((p) => String(p.id));
  const drafts = new Map<string, Row>();
  if (protoIds.length) {
    const { data: dr, error: dErr } = await client.from("protocol_drafts").select("protocol_id, payload").in("protocol_id", protoIds);
    if (dErr) throw dErr;
    for (const d of (dr ?? []) as Row[]) drafts.set(String(d.protocol_id), (d.payload as Row) ?? null);
  }
  return targets.map((t) => {
    const p = latest.get(t.id);
    return {
      ...t,
      protocol: p
        ? { id: String(p.id), payload: (p.payload as Row) ?? {}, revision: Number(p.revision ?? 0), name: String(p.name ?? ""), active: (p.active as boolean | null) ?? null }
        : null,
      draftPayload: p ? drafts.get(String(p.id)) ?? null : null,
    };
  });
}

export async function copyToTarget(
  plan: BulkTargetPlan,
  opts: { coachId: string; src: Row; sections: Partial<Record<CopySection, boolean>>; copyMacros: boolean },
  client: Client = sb,
): Promise<BulkResult> {
  try {
    const src = JSON.parse(JSON.stringify(opts.src)) as Row;
    if (plan.protocol) {
      const base = JSON.parse(JSON.stringify(plan.draftPayload ?? plan.protocol.payload ?? {})) as Row;
      const merged = copyProtocolSections(base, src, opts.sections);
      // Calorias/macros são individuais (peso, objetivo): só viajam se o coach pedir.
      if (!opts.copyMacros) merged.macros = base.macros;
      const checked = ProtocolPayloadSchema.safeParse(merged);
      if (!checked.success) return { id: plan.id, name: plan.name, ok: false, error: "o protocolo resultante ficou inválido" };
      const { error } = await client.rpc("save_protocol_with_plan", buildSaveProtocolArgs({
        protocolId: plan.protocol.id,
        studentId: plan.id,
        coachId: opts.coachId,
        name: plan.protocol.name || `Protocolo — ${plan.name}`,
        payload: checked.data,
        active: plan.protocol.active ?? false,
        asDraft: true,
        expectedRevision: plan.protocol.revision,
      }));
      if (error) return { id: plan.id, name: plan.name, ok: false, error: error.message ?? String(error) };
      return { id: plan.id, name: plan.name, ok: true, mode: "draft" };
    }
    const blank = blankProtocolPayload() as unknown as Row;
    const next = copyProtocolSections(blank, src, opts.sections);
    if (!opts.copyMacros) next.macros = blank.macros;
    const checked = ProtocolPayloadSchema.safeParse(next);
    if (!checked.success) return { id: plan.id, name: plan.name, ok: false, error: "o protocolo resultante ficou inválido" };
    const { error } = await client.from("protocols").insert({
      coach_id: opts.coachId,
      student_id: plan.id,
      name: `Protocolo — ${plan.name}`,
      is_template: false,
      payload: checked.data,
      active: false,
    });
    if (error) return { id: plan.id, name: plan.name, ok: false, error: error.message ?? String(error) };
    return { id: plan.id, name: plan.name, ok: true, mode: "created" };
  } catch (e) {
    return { id: plan.id, name: plan.name, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
