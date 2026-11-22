import { describe, expect, it } from "vitest";
import { buildStudentContext, meaningfulText, relativeDays } from "../studentContext";

describe("faixa do aluno — dados da anamnese e do último check-in", () => {
  it("respostas vazias ou negativas não viram aviso", () => {
    for (const v of ["", "  ", "Não", "não.", "Nenhuma", "nada", "-", "N/A", "Não tenho"]) expect(meaningfulText(v), v).toBeNull();
    expect(meaningfulText("Não, mas sinto dor no ombro ao supinar")).toBe("Não, mas sinto dor no ombro ao supinar");
    expect(meaningfulText("Intolerância à lactose")).toBe("Intolerância à lactose");
  });

  it("peso do check-in mais recente vence o da anamnese", () => {
    const ctx = buildStudentContext({
      anamnesis: { payload: { meta_prioridade: "Hipertrofia", lesoes: "Não", alergias: "Lactose", dias_treino: "4 dias", nivel_treino: "Iniciante" }, baseline_metrics: { peso: 63 }, submitted_at: "2026-10-01T10:00:00Z" },
      lastCheckin: { submitted_at: "2026-11-12T10:00:00Z", current_metrics: { peso: "62,4" } },
    });
    expect(ctx).toMatchObject({
      goal: "Hipertrofia", injuries: null, allergies: "Lactose", trainingDays: "4 dias", level: "Iniciante",
      weightKg: 62.4, weightSource: "checkin", weightAt: "2026-11-12T10:00:00Z", lastCheckinAt: "2026-11-12T10:00:00Z", hasAnamnesis: true,
    });
  });

  it("sem check-in: usa o peso da anamnese e diz de onde veio", () => {
    const ctx = buildStudentContext({ anamnesis: { payload: { peso: "70.5" }, submitted_at: "2026-10-01T10:00:00Z" }, lastCheckin: null });
    expect(ctx).toMatchObject({ weightKg: 70.5, weightSource: "anamnesis", weightAt: "2026-10-01T10:00:00Z", lastCheckinAt: null });
  });

  it("aluno sem anamnese nem check-in", () => {
    expect(buildStudentContext({ anamnesis: null, lastCheckin: null })).toMatchObject({ hasAnamnesis: false, weightKg: null, goal: null });
  });

  it("datas relativas", () => {
    const now = new Date("2026-11-21T12:00:00Z");
    expect(relativeDays("2026-11-21T08:00:00Z", now)).toBe("hoje");
    expect(relativeDays("2026-11-20T08:00:00Z", now)).toBe("ontem");
    expect(relativeDays("2026-11-12T10:00:00Z", now)).toBe("há 9 dias");
    expect(relativeDays("2026-07-01T10:00:00Z", now)).toBe("há 5 meses");
    expect(relativeDays(null, now)).toBeNull();
  });
});
