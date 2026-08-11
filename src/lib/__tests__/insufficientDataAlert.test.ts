import { describe, it, expect } from "vitest";

/**
 * Espelha o candidato "insufficient_data" do edge function
 * supabase/functions/workout-alert-engine/index.ts.
 */
function insufficientDataAlert(sessionCount: number, setsLast7d: number, sleepSamples: number) {
  if (sessionCount < 3) return null;
  const missing: string[] = [];
  if (setsLast7d < 10) missing.push("esforço percebido (RIR) nas séries");
  if (sleepSamples < 3) missing.push("qualidade de sono no pós-treino");
  if (missing.length === 0) return null;
  return {
    alert_type: "insufficient_data",
    severity: "info" as const,
    message: `Não foi possível avaliar: ${missing.join(" e ")} — amostra insuficiente nos últimos registros.`,
    context: { setsLast7d, sleepSamples },
  };
}

describe("alerta de dados insuficientes", () => {
  it("não gera alerta sem histórico mínimo de sessões", () => {
    expect(insufficientDataAlert(2, 0, 0)).toBeNull();
  });

  it("não gera alerta quando há amostra suficiente", () => {
    expect(insufficientDataAlert(5, 10, 3)).toBeNull();
  });

  it("cita apenas o RIR quando faltam séries", () => {
    const a = insufficientDataAlert(5, 9, 4)!;
    expect(a.severity).toBe("info");
    expect(a.message).toBe(
      "Não foi possível avaliar: esforço percebido (RIR) nas séries — amostra insuficiente nos últimos registros.",
    );
  });

  it("cita apenas o sono quando faltam avaliações de sono", () => {
    const a = insufficientDataAlert(5, 20, 2)!;
    expect(a.message).toBe(
      "Não foi possível avaliar: qualidade de sono no pós-treino — amostra insuficiente nos últimos registros.",
    );
  });

  it("cita os dois quando ambos faltam e guarda o contexto", () => {
    const a = insufficientDataAlert(3, 4, 1)!;
    expect(a.message).toBe(
      "Não foi possível avaliar: esforço percebido (RIR) nas séries e qualidade de sono no pós-treino — amostra insuficiente nos últimos registros.",
    );
    expect(a.context).toEqual({ setsLast7d: 4, sleepSamples: 1 });
  });
});
