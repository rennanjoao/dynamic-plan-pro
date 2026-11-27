// Regras de quem pode excluir a conta e os dados de um aluno (LGPD, art. 18).
// Sem imports de Deno: testado pelo vitest.

export const DELETE_CONFIRM_WORD = "EXCLUIR";

export type DeletionInput = {
  callerId: string;
  targetId: string;
  callerRoles: string[];
  targetRoles: string[];
  /** Vínculos do aluno-alvo com coaches (qualquer status). */
  targetCoachLinks: { coach_id: string; status: string | null }[];
  targetIsPartner: boolean;
  confirm: unknown;
};

export type DeletionDecision =
  | { ok: true; actor: "self" | "coach" | "admin" }
  | { ok: false; status: number; error: string };

export function decideDeletion(i: DeletionInput): DeletionDecision {
  if (i.confirm !== DELETE_CONFIRM_WORD) {
    return { ok: false, status: 400, error: `Digite ${DELETE_CONFIRM_WORD} para confirmar.` };
  }
  if (i.targetRoles.includes("coach") || i.targetRoles.includes("admin")) {
    return { ok: false, status: 403, error: "Esta opção é só para contas de aluno." };
  }
  if (i.targetIsPartner) {
    return { ok: false, status: 409, error: "Esta conta tem perfil de parceria (comissões). Peça a exclusão ao administrador." };
  }
  if (i.callerId === i.targetId) return { ok: true, actor: "self" };
  if (i.callerRoles.includes("admin")) return { ok: true, actor: "admin" };
  if (i.callerRoles.includes("coach")) {
    const mine = i.targetCoachLinks.some((l) => l.coach_id === i.callerId);
    if (!mine) return { ok: false, status: 403, error: "Este aluno não é seu." };
    const otherActive = i.targetCoachLinks.some((l) => l.coach_id !== i.callerId && l.status === "active");
    if (otherActive) {
      return { ok: false, status: 409, error: "O aluno está ativo com outro coach. Só ele mesmo pode excluir a conta." };
    }
    return { ok: true, actor: "coach" };
  }
  return { ok: false, status: 403, error: "Acesso negado." };
}
