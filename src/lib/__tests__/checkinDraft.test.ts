import { beforeEach, describe, expect, it } from "vitest";
import {
  CHECKIN_DRAFT_MAX_AGE_MS,
  checkinDraftKey,
  clearCheckinDrafts,
  draftHasContent,
  loadCheckinDraft,
  saveCheckinDraft,
} from "@/lib/checkinDraft";

const SID = "aluno-1";

beforeEach(() => localStorage.clear());

describe("checkinDraft", () => {
  it("chave separa check-in novo de atualização de um check-in específico", () => {
    expect(checkinDraftKey(SID, "new")).not.toBe(checkinDraftKey(SID, "update", "ci-1"));
    expect(checkinDraftKey(SID, "update", "ci-1")).not.toBe(checkinDraftKey(SID, "update", "ci-2"));
  });

  it("medidas iniciais vindas da anamnese sozinhas não contam como rascunho", () => {
    expect(draftHasContent({ data: {}, metrics: { ini_peso: "70" } })).toBe(false);
    expect(draftHasContent({ data: { humor: "bom" }, metrics: {} })).toBe(true);
    expect(draftHasContent({ data: {}, metrics: { cur_peso: "69,5" } })).toBe(true);
    expect(draftHasContent({ data: { obs: "   ", lista: [] }, metrics: {} })).toBe(false);
  });

  it("salva e recupera respostas, medidas e etapa", () => {
    const key = checkinDraftKey(SID, "new");
    saveCheckinDraft(key, { data: { humor: "bom" }, metrics: { cur_peso: "69,5" }, step: 2 });
    const d = loadCheckinDraft(key);
    expect(d?.data).toEqual({ humor: "bom" });
    expect(d?.metrics).toEqual({ cur_peso: "69,5" });
    expect(d?.step).toBe(2);
  });

  it("rascunho vazio não é gravado (e apaga o anterior)", () => {
    const key = checkinDraftKey(SID, "new");
    saveCheckinDraft(key, { data: { humor: "bom" }, metrics: {}, step: 1 });
    saveCheckinDraft(key, { data: {}, metrics: {}, step: 1 });
    expect(localStorage.getItem(key)).toBeNull();
    expect(loadCheckinDraft(key)).toBeNull();
  });

  it("descarta rascunho mais velho que um ciclo", () => {
    const key = checkinDraftKey(SID, "new");
    const t0 = 1_000_000;
    saveCheckinDraft(key, { data: { humor: "bom" }, metrics: {}, step: 1 }, t0);
    expect(loadCheckinDraft(key, t0 + CHECKIN_DRAFT_MAX_AGE_MS - 1)).not.toBeNull();
    expect(loadCheckinDraft(key, t0 + CHECKIN_DRAFT_MAX_AGE_MS + 1)).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
  });

  it("JSON corrompido não quebra a tela", () => {
    const key = checkinDraftKey(SID, "new");
    localStorage.setItem(key, "{nao-json");
    expect(loadCheckinDraft(key)).toBeNull();
  });

  it("limpa só os rascunhos do aluno informado", () => {
    saveCheckinDraft(checkinDraftKey(SID, "new"), { data: { a: 1 }, metrics: {}, step: 1 });
    saveCheckinDraft(checkinDraftKey(SID, "update", "ci-1"), { data: { a: 1 }, metrics: {}, step: 1 });
    saveCheckinDraft(checkinDraftKey("outro", "new"), { data: { a: 1 }, metrics: {}, step: 1 });
    clearCheckinDrafts(SID);
    expect(loadCheckinDraft(checkinDraftKey(SID, "new"))).toBeNull();
    expect(loadCheckinDraft(checkinDraftKey(SID, "update", "ci-1"))).toBeNull();
    expect(loadCheckinDraft(checkinDraftKey("outro", "new"))).not.toBeNull();
  });
});
