import { describe, expect, it } from "vitest";
import { describePublishStatus, type PublishStatusInput } from "../publishStatus";

const base: PublishStatusInput = {
  isEditMode: true,
  active: true,
  publishing: false,
  autosaving: false,
  saveStatus: "published",
  isDirty: false,
  hasDraft: false,
  pendingCount: 0,
  lastAutosavedAt: null,
};

describe("barra de publicar — um status só", () => {
  it("publicado", () => {
    expect(describePublishStatus(base)).toMatchObject({ kind: "published", tone: "emerald" });
  });

  it("rascunho diz quantas alterações o aluno ainda NÃO vê", () => {
    expect(describePublishStatus({ ...base, isDirty: true, saveStatus: "dirty", pendingCount: 3 }).text)
      .toBe("Rascunho — o aluno ainda NÃO vê 3 alterações");
    expect(describePublishStatus({ ...base, hasDraft: true, saveStatus: "draft", pendingCount: 1 }).text)
      .toBe("Rascunho — o aluno ainda NÃO vê 1 alteração");
    expect(describePublishStatus({ ...base, hasDraft: true, saveStatus: "draft" }).text)
      .toBe("Rascunho — o aluno ainda NÃO vê estas mudanças");
  });

  it("'salvo às' só depois que o autosave terminou", () => {
    const at = new Date(2026, 10, 21, 14, 32);
    expect(describePublishStatus({ ...base, hasDraft: true, isDirty: true, saveStatus: "draft", lastAutosavedAt: at }).text)
      .toMatch(/salvo às 14:32$/);
    expect(describePublishStatus({ ...base, hasDraft: true, isDirty: true, saveStatus: "dirty", lastAutosavedAt: at }).text)
      .not.toMatch(/salvo às/);
  });

  it("inativo vem antes de rascunho (o aluno não vê nada)", () => {
    expect(describePublishStatus({ ...base, active: false, isDirty: true, saveStatus: "dirty" }))
      .toMatchObject({ kind: "inactive", tone: "amber" });
  });

  it("protocolo novo, salvando, conflito e erro", () => {
    expect(describePublishStatus({ ...base, isEditMode: false }).kind).toBe("new");
    expect(describePublishStatus({ ...base, autosaving: true }).kind).toBe("saving");
    expect(describePublishStatus({ ...base, publishing: true }).text).toBe("Publicando…");
    expect(describePublishStatus({ ...base, saveStatus: "conflict" })).toMatchObject({ kind: "conflict", tone: "rose" });
    expect(describePublishStatus({ ...base, saveStatus: "error" })).toMatchObject({ kind: "error", tone: "rose" });
  });
});
