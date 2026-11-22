// src/lib/publishStatus.ts
//
// UM status só para a barra de publicar do protocolo (auditoria de
// 21/11/2026). Antes eram até 6 sinais na tela para dizer a mesma coisa —
// cartão âmbar de rascunho no topo, contador de seções, lista de pendências,
// aviso "O aluno ainda NÃO vê", aviso de inativo e o texto de status.
//
// A ordem importa: o que impede o aluno de ver a versão certa vem primeiro.

export type PublishStatusKind =
  | "publishing" | "saving" | "conflict" | "error" | "inactive" | "new" | "draft" | "published";

export type PublishStatusTone = "neutral" | "amber" | "rose" | "emerald";

export interface PublishStatusInput {
  isEditMode: boolean;
  active: boolean;
  /** Publicação em andamento (botão Publicar). */
  publishing: boolean;
  /** Autosave do rascunho em andamento. */
  autosaving: boolean;
  saveStatus: "published" | "dirty" | "saving" | "draft" | "conflict" | "error";
  isDirty: boolean;
  hasDraft: boolean;
  pendingCount: number;
  lastAutosavedAt: Date | null;
}

export interface PublishStatus {
  kind: PublishStatusKind;
  tone: PublishStatusTone;
  text: string;
}

const hhmm = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export function describePublishStatus(i: PublishStatusInput): PublishStatus {
  if (i.publishing) return { kind: "publishing", tone: "neutral", text: "Publicando…" };
  if (i.saveStatus === "saving" || i.autosaving) return { kind: "saving", tone: "neutral", text: "Salvando rascunho…" };
  if (i.saveStatus === "conflict") {
    return { kind: "conflict", tone: "rose", text: "Conflito de edição — recarregue a página antes de publicar" };
  }
  if (i.saveStatus === "error") {
    return { kind: "error", tone: "rose", text: "Erro ao salvar o rascunho — confira a conexão e tente de novo" };
  }
  if (!i.active) return { kind: "inactive", tone: "amber", text: "Inativo — o aluno não vê este protocolo" };
  if (!i.isEditMode) {
    return { kind: "new", tone: "amber", text: "Protocolo novo — o aluno ainda não vê nada até você publicar" };
  }
  if (i.hasDraft || i.isDirty) {
    const what = i.pendingCount > 0
      ? `${i.pendingCount} ${i.pendingCount === 1 ? "alteração" : "alterações"}`
      : "estas mudanças";
    // "salvo às" só depois que o autosave terminou (antes do autosave, a edição ainda está só na tela).
    const saved = i.saveStatus === "draft" && i.lastAutosavedAt ? ` · salvo às ${hhmm(i.lastAutosavedAt)}` : "";
    return { kind: "draft", tone: "amber", text: `Rascunho — o aluno ainda NÃO vê ${what}${saved}` };
  }
  return { kind: "published", tone: "emerald", text: "Publicado — o aluno vê esta versão" };
}
