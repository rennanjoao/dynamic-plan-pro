import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { buildInviteLink, buildInviteMessage, normalizeWhatsapp } from "../InviteStudentDialog";

describe("convite de aluno", () => {
  it("link já abre o cadastro com o código", () => {
    expect(buildInviteLink("https://app.eliteprimehub.com.br/", "ELT-7K4P92")).toBe("https://app.eliteprimehub.com.br/anamnesis?codigo=ELT-7K4P92");
  });
  it("mensagem usa o primeiro nome, o coach, o link e o código", () => {
    const m = buildInviteMessage({ studentName: "Maria Silva", coachName: "Ana Souza", link: "L", code: "C1" });
    expect(m).toMatch(/^Oi, Maria!/);
    expect(m).toContain("com Ana Souza");
    expect(m).toContain("L");
    expect(m).toContain("C1");
  });
  it("sem nome não inventa", () => {
    expect(buildInviteMessage({ link: "L", code: "C" })).toMatch(/^Oi! Seu acesso/);
  });
  it("WhatsApp: adiciona 55 a número brasileiro; vazio continua vazio", () => {
    expect(normalizeWhatsapp("(11) 91234-5678")).toBe("5511912345678");
    expect(normalizeWhatsapp("+55 11 91234-5678")).toBe("5511912345678");
    expect(normalizeWhatsapp("")).toBe("");
  });
});
