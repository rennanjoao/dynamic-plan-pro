import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ageFromBirthDate, formatBirthDate, isMinor, parseBirthDate } from "../age";
import { consentIssue } from "../consent";
import { redactForAI } from "../../../supabase/functions/_shared/aiPrivacy";

const NOW = new Date(2026, 10, 27); // 27/11/2026

describe("idade a partir da data de nascimento", () => {
  it("aceita AAAA-MM-DD e DD/MM/AAAA", () => {
    expect(ageFromBirthDate("1970-05-10", NOW)).toBe(56);
    expect(ageFromBirthDate("10/05/1970", NOW)).toBe(56);
  });
  it("conta o aniversário só quando ele já passou", () => {
    expect(ageFromBirthDate("1970-11-27", NOW)).toBe(56);
    expect(ageFromBirthDate("1970-11-28", NOW)).toBe(55);
  });
  it("datas inválidas, vazias ou futuras dão null", () => {
    expect(ageFromBirthDate("", NOW)).toBeNull();
    expect(ageFromBirthDate("2026-02-30", NOW)).toBeNull();
    expect(ageFromBirthDate("2030-01-01", NOW)).toBeNull();
    expect(parseBirthDate(undefined)).toBeNull();
  });
  it("formata no padrão brasileiro", () => {
    expect(formatBirthDate("1970-05-10")).toBe("10/05/1970");
  });
  it("menor de 18", () => {
    expect(isMinor("2010-01-01", NOW)).toBe(true);
    expect(isMinor("2008-11-27", NOW)).toBe(false);
    expect(isMinor("", NOW)).toBe(false);
  });
});

describe("consentimento", () => {
  const base = { accepted: true, minor: false, guardianName: "", guardianAccepted: false };
  it("exige a caixa marcada", () => {
    expect(consentIssue({ ...base, accepted: false })).toMatch(/autorização/);
    expect(consentIssue(base)).toBeNull();
  });
  it("menor exige nome e aceite do responsável", () => {
    expect(consentIssue({ ...base, minor: true })).toMatch(/nome do responsável/);
    expect(consentIssue({ ...base, minor: true, guardianName: "Maria Souza" })).toMatch(/responsável legal precisa/);
    expect(consentIssue({ ...base, minor: true, guardianName: "Maria Souza", guardianAccepted: true })).toBeNull();
  });
});

describe("dados enviados para a IA", () => {
  it("tira identificação, senha, links e troca nascimento por idade", () => {
    const out = redactForAI({
      nome: "Ana", email: "a@b.com", whatsapp: "11999", senha: "123456", cidade: "SP", access_code: "X1",
      data_nasc: "1970-05-10", peso: "70", lesoes: "joelho",
      fotos: { frente: "https://x/y.jpg" }, foto_extra: "https://x/z.jpg",
      metrics_raw: { cintura: 80, email: "c@d.com" },
    }, NOW);
    expect(out).toEqual({ idade: 56, peso: "70", lesoes: "joelho", metrics_raw: { cintura: 80 } });
  });
  it("payload vazio ou inválido vira objeto vazio", () => {
    expect(redactForAI(null)).toEqual({});
    expect(redactForAI("texto")).toEqual({});
  });
});

describe("senha fora da ficha salva", () => {
  it("o payload da anamnese é montado sem a senha", () => {
    const src = readFileSync("src/pages/Anamnesis.tsx", "utf8");
    expect(src).toContain("...stripSecretsFromDraft(d), gender");
    expect(src).not.toMatch(/payload\s*=\s*\{\s*\.\.\.d,/);
  });
});
