import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { decideDeletion, DELETE_CONFIRM_WORD as SERVER_WORD, type DeletionInput } from "../../../supabase/functions/_shared/studentDeletion";
import { DELETE_CONFIRM_WORD } from "../accountDeletion";
import { canReencode, reencodeImage } from "../imageSanitize";

const base: DeletionInput = {
  callerId: "aluno", targetId: "aluno", callerRoles: ["user"], targetRoles: ["user"],
  targetCoachLinks: [{ coach_id: "coachA", status: "active" }], targetIsPartner: false, confirm: "EXCLUIR",
};

describe("quem pode excluir a conta do aluno", () => {
  it("o próprio aluno pode", () => {
    expect(decideDeletion(base)).toEqual({ ok: true, actor: "self" });
  });
  it("exige a palavra de confirmação", () => {
    expect(decideDeletion({ ...base, confirm: "excluir " })).toMatchObject({ ok: false, status: 400 });
    expect(decideDeletion({ ...base, confirm: undefined })).toMatchObject({ ok: false });
  });
  it("o coach do aluno pode", () => {
    expect(decideDeletion({ ...base, callerId: "coachA", callerRoles: ["coach"] })).toEqual({ ok: true, actor: "coach" });
  });
  it("ex-coach pode se o aluno não estiver ativo com outro coach", () => {
    const links = [{ coach_id: "coachA", status: "inactive" }];
    expect(decideDeletion({ ...base, callerId: "coachA", callerRoles: ["coach"], targetCoachLinks: links })).toMatchObject({ ok: true });
  });
  it("coach não pode excluir aluno de outro coach", () => {
    expect(decideDeletion({ ...base, callerId: "coachB", callerRoles: ["coach"] })).toMatchObject({ ok: false, status: 403 });
  });
  it("coach não pode se o aluno está ativo com outro coach", () => {
    const links = [{ coach_id: "coachA", status: "inactive" }, { coach_id: "coachB", status: "active" }];
    expect(decideDeletion({ ...base, callerId: "coachA", callerRoles: ["coach"], targetCoachLinks: links })).toMatchObject({ ok: false, status: 409 });
  });
  it("aluno comum não pode excluir outra pessoa", () => {
    expect(decideDeletion({ ...base, callerId: "outro" })).toMatchObject({ ok: false, status: 403 });
  });
  it("admin pode", () => {
    expect(decideDeletion({ ...base, callerId: "adm", callerRoles: ["admin"] })).toEqual({ ok: true, actor: "admin" });
  });
  it("nunca apaga conta de coach/admin nem de parceiro por aqui", () => {
    expect(decideDeletion({ ...base, targetRoles: ["coach"] })).toMatchObject({ ok: false, status: 403 });
    expect(decideDeletion({ ...base, targetIsPartner: true })).toMatchObject({ ok: false, status: 409 });
  });
  it("a palavra é a mesma no app e no servidor", () => {
    expect(DELETE_CONFIRM_WORD).toBe(SERVER_WORD);
  });
});

describe("migração de exclusão mantém o financeiro", () => {
  const sql = readFileSync("supabase/migrations/20261127100000_lgpd_student_deletion.sql", "utf8");
  it("lista de tabelas mantidas", () => {
    for (const t of ["coach_finances", "student_subscriptions", "partner_commissions", "admin_audit_log"]) {
      expect(sql).toContain(`'${t}'`);
    }
  });
  it("só a service_role executa", () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.lgpd_delete_student_rows\(uuid\) FROM anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.lgpd_delete_student_rows\(uuid\) TO service_role/);
  });
  it("comissão fica com student_id NULL em vez de sumir", () => {
    expect(sql).toMatch(/partner_commissions_student_id_fkey[\s\S]*ON DELETE SET NULL/);
  });
});

describe("fotos sem metadados", () => {
  it("só redesenha tipos de imagem seguros", () => {
    expect(canReencode("image/jpeg")).toBe(true);
    expect(canReencode("image/heic")).toBe(true);
    expect(canReencode("image/gif")).toBe(false);
    expect(canReencode("image/svg+xml")).toBe(false);
    expect(canReencode("application/pdf")).toBe(false);
    expect(canReencode("")).toBe(false);
  });
  it("PDF passa direto", async () => {
    const f = new File(["%PDF"], "exame.pdf", { type: "application/pdf" });
    expect(await reencodeImage(f)).toBe(f);
  });
  it("se o navegador não abrir a imagem, envia o original (não trava)", async () => {
    const f = new File(["x"], "foto.jpg", { type: "image/jpeg" });
    expect(await reencodeImage(f)).toBe(f);
  });
});

describe("ex-coach: 90 dias", () => {
  const sql = readFileSync("supabase/migrations/20261127110000_lgpd_former_coach_90_days.sql", "utf8");
  it("o prazo é de 90 dias e a data de desligamento é gravada", () => {
    expect(sql).toMatch(/interval '90 days'/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS ended_at/);
  });
  it("nenhuma política reescrita volta a dar acesso só pelo vínculo sem prazo", () => {
    const policies = sql.split(/CREATE POLICY/).slice(1);
    expect(policies.length).toBe(13);
    for (const p of policies) {
      expect(p).not.toMatch(/FROM public\.coach_students/);
      expect(p).toMatch(/coach_can_see_student/);
    }
  });
});
